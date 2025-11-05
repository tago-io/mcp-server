import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Resources } from "@tago-io/sdk";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { handlerTools } from "../mcp-tools";

const MCP_PORT = Number.parseInt(process.env.MCP_PORT || "3000");
const TAGOIO_API = process.env.TAGOIO_API || "https://api.tago.io";
const SESSION_TIMEOUT_MINUTES = Number.parseInt(process.env.SESSION_LIVE || "60");
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id, Last-Event-ID",
};

interface SessionData {
  transport: StreamableHTTPServerTransport;
  resources: Resources;
  lastActivity: number;
}

interface SessionMap {
  [sessionId: string]: SessionData;
}

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
function createMcpServer(resources: Resources): McpServer {
  const mcpServer = new McpServer({
    name: "middleware-mcp-tagoio",
    version: "1.0.0",
  });

  handlerTools(mcpServer, resources);
  return mcpServer;
}

/**
 * Updates the last activity timestamp for a session.
 */
function updateSessionActivity(sessions: SessionMap, sessionId: string): void {
  if (sessions[sessionId]) {
    sessions[sessionId].lastActivity = Date.now();
  }
}

/**
 * Handles POST requests for initialization and tool calls.
 */
async function handlePostRequest(
  req: IncomingMessage,
  res: ServerResponse,
  sessions: SessionMap
): Promise<void> {
  const body = await parseBody(req);
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && sessions[sessionId]) {
    updateSessionActivity(sessions, sessionId);
    const session = sessions[sessionId];
    await session.transport.handleRequest(req, res, body);
    return;
  }

  if (!sessionId && isInitializeRequest(body)) {
    await handleInitializeRequest(req, res, body, sessions);
    return;
  }

  sendJsonResponse(res, 400, {
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Bad Request: No valid session ID provided",
    },
    id: null,
  });
}

/**
 * Handles initialization requests with Bearer token authentication.
 */
async function handleInitializeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  sessions: SessionMap
): Promise<void> {
  const token = extractBearerToken(req);

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

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId: string) => {
      console.info(`Session initialized: ${newSessionId}`);
      sessions[newSessionId] = { transport, resources, lastActivity: Date.now() };
    },
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid && sessions[sid]) {
      console.error(`Session closed: ${sid}`);
      delete sessions[sid];
    }
  };

  const mcpServer = createMcpServer(resources);
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, body);
}

/**
 * Handles GET requests for SSE streams.
 */
async function handleGetRequest(
  req: IncomingMessage,
  res: ServerResponse,
  sessions: SessionMap
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId || !sessions[sessionId]) {
    sendJsonResponse(res, 400, {
      error: "Bad Request",
      message: "Invalid or missing session ID",
    });
    return;
  }

  updateSessionActivity(sessions, sessionId);

  const lastEventId = req.headers["last-event-id"] as string | undefined;
  if (lastEventId) {
    console.error(`Client reconnecting: ${lastEventId}`);
  }

  const session = sessions[sessionId];
  await session.transport.handleRequest(req, res);
}

/**
 * Handles DELETE requests for session termination.
 */
async function handleDeleteRequest(
  req: IncomingMessage,
  res: ServerResponse,
  sessions: SessionMap
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId || !sessions[sessionId]) {
    sendJsonResponse(res, 400, {
      error: "Bad Request",
      message: "Invalid or missing session ID",
    });
    return;
  }

  console.error(`Session termination request: ${sessionId}`);
  const session = sessions[sessionId];
  await session.transport.handleRequest(req, res);
}

/**
 * Routes HTTP requests to appropriate handlers based on method.
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  sessions: SessionMap
): Promise<void> {
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
      await handlePostRequest(req, res, sessions);
    } else if (method === "GET") {
      await handleGetRequest(req, res, sessions);
    } else if (method === "DELETE") {
      await handleDeleteRequest(req, res, sessions);
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
 * Closes a specific session and cleans up its resources.
 */
async function closeSession(sessions: SessionMap, sessionId: string): Promise<void> {
  try {
    console.error(`Closing session ${sessionId}`);
    await sessions[sessionId].transport.close();
    delete sessions[sessionId];
  } catch (error) {
    console.error(`Error closing session ${sessionId}:`, error);
  }
}

/**
 * Checks for expired sessions and removes them.
 */
async function cleanupExpiredSessions(sessions: SessionMap): Promise<void> {
  const now = Date.now();
  const expiredSessions: string[] = [];

  for (const sessionId in sessions) {
    const session = sessions[sessionId];
    const inactiveTime = now - session.lastActivity;

    if (inactiveTime > SESSION_TIMEOUT_MS) {
      expiredSessions.push(sessionId);
    }
  }

  for (const sessionId of expiredSessions) {
    console.error(`Session expired due to inactivity: ${sessionId}`);
    await closeSession(sessions, sessionId);
  }
}

/**
 * Closes all active sessions and their transports.
 */
async function closeAllSessions(sessions: SessionMap): Promise<void> {
  for (const sessionId in sessions) {
    await closeSession(sessions, sessionId);
  }
}

/**
 * Starts the MCP HTTP server with Bearer token authentication and session management.
 */
async function startHttpServer(): Promise<void> {
  try {
    process.env.TAGOIO_API = TAGOIO_API;

    const sessions: SessionMap = {};

    const server = createServer((req, res) => handleRequest(req, res, sessions));

    // Start periodic session cleanup (every 5 minutes)
    const cleanupInterval = setInterval(() => {
      cleanupExpiredSessions(sessions);
    }, 5 * 60 * 1000);

    server.listen(MCP_PORT, () => {
      console.error(`MCP Streamable HTTP Server listening on port ${MCP_PORT}`);
    });

    process.on("SIGINT", async () => {
      console.error("Shutting down server...");
      clearInterval(cleanupInterval);
      await closeAllSessions(sessions);
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

export { startHttpServer };
