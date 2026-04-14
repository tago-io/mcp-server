import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Resources } from "@tago-io/sdk";

import { handlerTools } from "../mcp-tools";
import { SERVER_NAME, SERVER_VERSION, SERVER_INSTRUCTIONS } from "../utils/server-config";

const DEFAULT_TAGOIO_REGION = "us-e1";
const VALID_REGIONS = ["us-e1", "eu-w1"];

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, mcp-session-id, mcp-protocol-version, x-tagoio-region",
};

/**
 * Extracts the Bearer token from an Authorization header string.
 */
function extractBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function buildRegion(tagoioRegion: string): { api: string; sse: string } {
  return {
    api: `https://api.${tagoioRegion}.tago.io`,
    sse: `https://sse.${tagoioRegion}.tago.io`,
  };
}

interface TokenValidationSuccess {
  resources: Resources;
}

interface TokenValidationError {
  error: string;
  statusCode: number;
}

type TokenValidationResult = TokenValidationSuccess | TokenValidationError;

function isTokenError(result: TokenValidationResult): result is TokenValidationError {
  return "error" in result;
}

/**
 * Validates the TagoIO token by attempting to fetch account information.
 * Differentiates between auth failures and infrastructure errors.
 */
async function validateTagoToken(token: string, tagoioRegion: string): Promise<TokenValidationResult> {
  try {
    const region = buildRegion(tagoioRegion);
    const resources = new Resources({ token, region });
    await resources.account.info();
    return { resources };
  } catch (error) {
    console.error("Token validation failed:", error);

    if (error instanceof Error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && ["ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED", "ECONNRESET"].includes(code)) {
        return { error: `Unable to reach TagoIO API for region "${tagoioRegion}". Check network connectivity.`, statusCode: 502 };
      }

      const statusCode = (error as any).statusCode;
      if (typeof statusCode === "number" && statusCode >= 500) {
        return { error: "TagoIO API is temporarily unavailable. Please try again later.", statusCode: 502 };
      }
    }

    return { error: "Unauthorized: Invalid TagoIO token", statusCode: 401 };
  }
}

/**
 * Creates a new MCP server instance with registered tools.
 */
function createMcpServer(resources: Resources, token: string): McpServer {
  const mcpServer = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  handlerTools(mcpServer, resources, token);
  return mcpServer;
}

export {
  DEFAULT_TAGOIO_REGION,
  VALID_REGIONS,
  CORS_HEADERS,
  extractBearerToken,
  buildRegion,
  validateTagoToken,
  createMcpServer,
  isTokenError,
};

export type { TokenValidationResult, TokenValidationSuccess, TokenValidationError };
