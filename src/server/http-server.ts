import { IncomingMessage, ServerResponse, createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { CORS_HEADERS, DEFAULT_TAGOIO_REGION, createMcpServer, extractToken, isTokenError, validateTagoToken } from "./shared";
import { SERVER_NAME, SERVER_VERSION } from "../utils/server-config";

const MAX_BODY_SIZE = 1_048_576; // 1 MB
const MCP_ENDPOINT = "/mcp";
const HEALTH_ENDPOINT = "/health";

function parseMcpPort(): number {
  const raw = process.env.MCP_PORT || "3000";
  const port = Number.parseInt(raw, 10);
  if (Number.isNaN(port) || port < 0 || port > 65535) {
    console.error(`Invalid MCP_PORT "${raw}". Must be a number between 0 and 65535.`);
    process.exit(1);
  }
  return port;
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
async function handlePostRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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

  const result = await validateTagoToken(token, tagoioRegion);

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

  const mcpServer = createMcpServer(result.resources, token);

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
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { method, url } = req;

  if (url === HEALTH_ENDPOINT && method === "GET") {
    handleHealthRequest(res);
    return;
  }

  // Check path first — only /mcp is supported (except OPTIONS which applies globally for CORS)
  if (url !== MCP_ENDPOINT && method !== "OPTIONS") {
    sendJsonResponse(res, 404, {
      error: "Not Found",
      message: `Only ${MCP_ENDPOINT} and ${HEALTH_ENDPOINT} endpoints are supported`,
    });
    return;
  }

  if (method === "OPTIONS") {
    handleCorsPreflightRequest(res);
    return;
  }

  try {
    // Set CORS headers for all /mcp responses
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      res.setHeader(key, value);
    }

    if (method === "POST") {
      await handlePostRequest(req, res);
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
    console.error("Error handling MCP request:", error);
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
  const port = parseMcpPort();
  const server = createServer((req, res) => handleRequest(req, res));

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. Choose a different port via MCP_PORT.`);
    } else {
      console.error("HTTP server error:", error);
    }
    process.exit(1);
  });

  server.listen(port, () => {
    console.error(`MCP Streamable HTTP Server listening on port ${port}`);
  });

  process.on("SIGINT", () => {
    console.error("Shutting down server...");
    server.close(() => {
      console.error("Server shutdown complete");
      process.exit(0);
    });
  });
}

export { startHttpServer, handleRequest };
