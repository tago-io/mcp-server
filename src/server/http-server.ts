import { IncomingMessage, ServerResponse, createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Resources } from "@tago-io/sdk";

import { handlerTools } from "../mcp-tools";

const MCP_PORT = Number.parseInt(process.env.MCP_PORT || "3000");
const TAGOIO_API = process.env.TAGOIO_API || "https://api.tago.io";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id",
};

/**
 * Extracts the Bearer token from the Authorization header.
 */
function extractBearerToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Parses the JSON body from an incoming HTTP request.
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
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
 * Validates the TagoIO token by attempting to fetch account information.
 */
async function validateTagoToken(token: string): Promise<Resources | null> {
  try {
    const resources = new Resources({ token });
    await resources.account.info();
    return resources;
  } catch {
    return null;
  }
}

/**
 * Creates a new MCP server instance with registered tools.
 */
function createMcpServer(resources: Resources, token: string): McpServer {
  const mcpServer = new McpServer({
    name: "middleware-mcp-tagoio",
    version: "1.0.0",
  });

  handlerTools(mcpServer, resources, token);
  return mcpServer;
}

/**
 * Handles POST requests in stateless mode.
 *
 * Every request is fully self-contained: the Bearer token is validated,
 * an ephemeral McpServer and transport are created, the request is handled,
 * and the response is returned -- no session state is retained.
 */
async function handlePostRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = extractBearerToken(req);
  console.log(token);

  if (!token) {
    sendJsonResponse(res, 401, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Unauthorized: Bearer token required in Authorization header",
      },
      id: null,
    });
    return;
  }

  const resources = await validateTagoToken(token);

  if (!resources) {
    sendJsonResponse(res, 401, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Unauthorized: Invalid TagoIO token",
      },
      id: null,
    });
    return;
  }

  const body = await parseBody(req);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const mcpServer = createMcpServer(resources, token);
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, body);
}

/**
 * Routes HTTP requests to appropriate handlers based on method.
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { method, url } = req;

  if (method === "OPTIONS") {
    handleCorsPreflightRequest(res);
    return;
  }

  if (url !== "/mcp") {
    sendJsonResponse(res, 404, {
      error: "Not Found",
      message: "Only /mcp endpoint is supported",
    });
    return;
  }

  try {
    if (method === "POST") {
      await handlePostRequest(req, res);
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
  try {
    process.env.TAGOIO_API = TAGOIO_API;

    const server = createServer((req, res) => handleRequest(req, res));

    server.listen(MCP_PORT, () => {
      console.error(`MCP Streamable HTTP Server listening on port ${MCP_PORT}`);
    });

    process.on("SIGINT", () => {
      console.error("Shutting down server...");
      server.close(() => {
        console.error("Server shutdown complete");
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("Failed to start MCP HTTP server:", error);
    process.exit(1);
  }
}

export { startHttpServer, handleRequest, validateTagoToken, createMcpServer };
