import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

import { createMcpServer, validateTagoToken } from "./http-server";

const TAGOIO_API = process.env.TAGOIO_API || "https://api.tago.io";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id",
};

function jsonResult(statusCode: number, body: unknown, extraHeaders?: Record<string, string>): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

/**
 * AWS Lambda handler for MCP Streamable HTTP (stateless, JSON responses only).
 *
 * Compatible with API Gateway v2 HTTP API and Lambda Function URLs.
 */
async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  process.env.TAGOIO_API = TAGOIO_API;

  const method = event.requestContext.http.method.toUpperCase();

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
      body: "",
    };
  }

  if (method !== "POST") {
    return jsonResult(405, { error: "Method Not Allowed", message: `Method ${method} is not supported` });
  }

  // Extract Bearer token
  const authHeader = event.headers["authorization"] ?? event.headers["Authorization"] ?? "";
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch?.[1] ?? null;

  if (!token) {
    return jsonResult(401, {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unauthorized: Bearer token required in Authorization header" },
      id: null,
    });
  }

  const resources = await validateTagoToken(token);

  if (!resources) {
    return jsonResult(401, {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unauthorized: Invalid TagoIO token" },
      id: null,
    });
  }

  // Convert API Gateway event to a web-standard Request
  const rawBody = event.body ?? "";
  const bodyStr = event.isBase64Encoded ? Buffer.from(rawBody, "base64").toString("utf-8") : rawBody;

  const path = event.requestContext.http.path;
  const webRequest = new Request(`https://lambda${path}`, {
    method,
    headers: event.headers as Record<string, string>,
    body: bodyStr || undefined,
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const mcpServer = createMcpServer(resources, token);
  await mcpServer.connect(transport);

  const webResponse = await transport.handleRequest(webRequest);

  const responseBody = await webResponse.text();
  const responseHeaders: Record<string, string> = { ...CORS_HEADERS };
  webResponse.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    statusCode: webResponse.status,
    headers: responseHeaders,
    body: responseBody,
  };
}

export { handler };
