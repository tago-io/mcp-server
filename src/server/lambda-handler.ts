import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

import { logger } from "../utils/logger";
import { describeErrorSafely } from "../utils/safe-error";
import { buildServer } from "./build-server";
import { CORS_HEADERS, DEFAULT_TAGOIO_REGION, extractToken, isTokenError, validateTagoToken } from "./shared";

function jsonResult(statusCode: number, body: unknown, extraHeaders?: Record<string, string>): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

// API Gateway delivers headers in the client's original casing (unlike Node's
// http module, which lowercases them), so lookups must be case-insensitive.
function findHeader(headers: APIGatewayProxyEventV2["headers"], lowercaseName: string): string | undefined {
  const direct = headers[lowercaseName];
  if (direct !== undefined) {
    return direct;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowercaseName) {
      return value;
    }
  }
  return undefined;
}

/**
 * AWS Lambda handler for MCP Streamable HTTP (stateless, JSON responses only).
 *
 * Compatible with API Gateway v2 HTTP API and Lambda Function URLs.
 */
async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method.toUpperCase();

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
      body: "",
    };
  }

  const requestPath = event.requestContext.http.path;
  if (requestPath !== "/") {
    return jsonResult(404, { error: "Not Found", message: "Only the root endpoint is supported" });
  }

  if (method !== "POST") {
    return jsonResult(405, { error: "Method Not Allowed", message: `Method ${method} is not supported` });
  }

  const authHeader = findHeader(event.headers, "authorization") ?? "";
  const token = extractToken(authHeader);

  if (!token) {
    return jsonResult(401, {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unauthorized: Token required in Authorization header" },
      id: null,
    });
  }

  const tagoioRegion = findHeader(event.headers, "x-tagoio-region") ?? DEFAULT_TAGOIO_REGION;

  const result = await validateTagoToken(token, tagoioRegion);

  if (isTokenError(result)) {
    return jsonResult(result.statusCode, {
      jsonrpc: "2.0",
      error: { code: -32000, message: result.error },
      id: null,
    });
  }

  // Convert API Gateway event to a web-standard Request
  const rawBody = event.body ?? "";
  const bodyStr = event.isBase64Encoded ? Buffer.from(rawBody, "base64").toString("utf-8") : rawBody;

  const webRequest = new Request(`https://lambda${requestPath}`, {
    method,
    headers: event.headers as Record<string, string>,
    body: bodyStr || undefined,
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const mcpServer = buildServer({ resources: result.resources, token, region: result.region, ...result.credential });

  try {
    await mcpServer.connect(transport);

    const webResponse = await transport.handleRequest(webRequest);
    const responseBody = await webResponse.text();

    const responseHeaders: Record<string, string> = { ...CORS_HEADERS };
    for (const [key, value] of webResponse.headers.entries()) {
      responseHeaders[key] = value;
    }

    return {
      statusCode: webResponse.status,
      headers: responseHeaders,
      body: responseBody,
    };
  } catch (error) {
    // Defense in depth: never log the raw error object with the credential in scope.
    logger.error("Lambda MCP handler error:", describeErrorSafely(error, [token]));
    return jsonResult(500, {
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error processing MCP request" },
      id: null,
    });
  } finally {
    await mcpServer.close();
    await transport.close();
  }
}

export { handler };
