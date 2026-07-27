import { IncomingMessage, ServerResponse, createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { ServerEnv, serverEnvSchema } from "../utils/config.model";
import { logger } from "../utils/logger";
import { describeErrorSafely } from "../utils/safe-error";
import { SERVER_NAME, SERVER_VERSION } from "../utils/server-config";
import { buildServer } from "./build-server";
import { CORS_HEADERS, DEFAULT_TAGOIO_REGION, extractToken, isTokenError, validateTagoToken } from "./shared";

const MAX_BODY_SIZE = 1_048_576; // 1 MB
const MCP_ENDPOINT = "/";
const HEALTH_ENDPOINT = "/health";

// An empty MCP_PORT means "unset" (fall back to the default), matching prior
// behavior. TAGOIO_API is passed through as-is: an empty string there is a
// misconfigured pin, and normalizing it to "unset" would silently start an
// unpinned server that resolves the region from request headers instead.
function parseServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({ MCP_PORT: process.env.MCP_PORT || undefined, TAGOIO_API: process.env.TAGOIO_API });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "TAGOIO_API") {
      logger.error(`Invalid TAGOIO_API: ${issue.message}`);
    } else {
      logger.error(`Invalid MCP_PORT "${process.env.MCP_PORT}". Must be a number between 0 and 65535.`);
    }
    process.exit(1);
  }
  return parsed.data;
}

/**
 * Parses the JSON body from an incoming HTTP request with a size limit.
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : undefined);
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

/**
 * Sends a JSON response with CORS headers.
 */
function sendJsonResponse(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(data));
}

/**
 * Handles CORS preflight OPTIONS requests.
 */
function handleCorsPreflightRequest(res: ServerResponse): void {
  res.writeHead(204, {
    ...CORS_HEADERS,
    "Access-Control-Max-Age": "86400",
  });
  res.end();
}

/**
 * Handles POST requests in stateless mode.
 *
 * Every request is fully self-contained: the Bearer token is validated,
 * an ephemeral McpServer and transport are created, the request is handled,
 * and the response is returned -- no session state is retained.
 */
async function handlePostRequest(req: IncomingMessage, res: ServerResponse, apiUrl?: string): Promise<void> {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    sendJsonResponse(res, 401, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Unauthorized: Token required in Authorization header",
      },
      id: null,
    });
    return;
  }

  const tagoioRegion = (req.headers["x-tagoio-region"] as string) || DEFAULT_TAGOIO_REGION;

  const result = await validateTagoToken(token, tagoioRegion, apiUrl);

  if (isTokenError(result)) {
    sendJsonResponse(res, result.statusCode, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: result.error,
      },
      id: null,
    });
    return;
  }

  let body: unknown;
  try {
    body = await parseBody(req);
  } catch (error) {
    const isTooLarge = error instanceof Error && error.message === "Request body too large";
    const statusCode = isTooLarge ? 413 : 400;
    const message = isTooLarge ? "Payload Too Large" : "Parse error: Invalid JSON in request body";
    const code = isTooLarge ? -32000 : -32700;

    sendJsonResponse(res, statusCode, {
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    });
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const mcpServer = buildServer({ resources: result.resources, token, region: result.region, ...result.credential });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  } finally {
    await mcpServer.close();
    await transport.close();
  }
}

/**
 * Handles GET /health requests, returning server name, version, and status.
 */
function handleHealthRequest(res: ServerResponse): void {
  sendJsonResponse(res, 200, {
    name: SERVER_NAME,
    version: SERVER_VERSION,
    status: "ok",
  });
}

/**
 * Routes HTTP requests to appropriate handlers based on method.
 *
 * `apiUrl` is the operator-configured TAGOIO_API endpoint, threaded from
 * startup rather than read here so the request path never reaches process env.
 * Absent on the multi-region deployment.
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse, apiUrl?: string): Promise<void> {
  const { method, url } = req;

  if (url === HEALTH_ENDPOINT && method === "GET") {
    handleHealthRequest(res);
    return;
  }

  // Check path first: only root is supported (except OPTIONS which applies globally for CORS)
  if (url !== MCP_ENDPOINT && method !== "OPTIONS") {
    sendJsonResponse(res, 404, {
      error: "Not Found",
      message: `Only the root (${MCP_ENDPOINT}) and ${HEALTH_ENDPOINT} endpoints are supported`,
    });
    return;
  }

  if (method === "OPTIONS") {
    handleCorsPreflightRequest(res);
    return;
  }

  try {
    // Set CORS headers for all MCP responses
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      res.setHeader(key, value);
    }

    if (method === "POST") {
      await handlePostRequest(req, res, apiUrl);
    } else if (method === "GET" || method === "DELETE") {
      // Let the SDK transport handle GET (SSE) and DELETE (session termination).
      // In stateless mode it returns 405 with proper MCP-compliant headers.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await transport.handleRequest(req, res);
    } else {
      sendJsonResponse(res, 405, {
        error: "Method Not Allowed",
        message: `Method ${method} is not supported`,
      });
    }
  } catch (error) {
    // Defense in depth: the request credential is in scope here and SDK error
    // structures can carry it. Never log the raw error object.
    logger.error("Error handling MCP request:", describeErrorSafely(error, [extractToken(req.headers.authorization) ?? undefined]));
    if (!res.headersSent) {
      sendJsonResponse(res, 500, {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
}

/**
 * Starts the MCP HTTP server in stateless mode.
 */
async function startHttpServer(): Promise<void> {
  const { MCP_PORT: port, TAGOIO_API: apiUrl } = parseServerEnv();
  const server = createServer((req, res) => handleRequest(req, res, apiUrl));

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      logger.error(`Port ${port} is already in use. Choose a different port via MCP_PORT.`);
    } else {
      logger.error("HTTP server error:", error);
    }
    process.exit(1);
  });

  server.listen(port, () => {
    logger.info(`MCP Streamable HTTP Server listening on port ${port}`);
    if (apiUrl) {
      logger.info(`Pinned to the dedicated TagoIO endpoint ${apiUrl}; the x-tagoio-region header is ignored.`);
    }
  });

  const connections = new Set<import("node:net").Socket>();

  server.on("connection", (socket) => {
    connections.add(socket);
    socket.once("close", () => connections.delete(socket));
  });

  const SHUTDOWN_TIMEOUT_MS = 5_000;

  function shutdown() {
    logger.info("Shutting down server...");

    server.close(() => {
      logger.info("Server shutdown complete");
      process.exit(0);
    });

    setTimeout(() => {
      logger.info(`Forcing shutdown after ${SHUTDOWN_TIMEOUT_MS / 1_000}s, destroying ${connections.size} remaining connection(s)`);
      for (const socket of connections) {
        socket.destroy();
      }
      process.exit(0);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export { startHttpServer, handleRequest };
