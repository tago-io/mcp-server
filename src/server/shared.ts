import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Network, Resources } from "@tago-io/sdk";

import { handlerTools } from "../mcp-tools";
import { logger } from "../utils/logger";
import { SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from "../utils/server-config";

const VALID_REGIONS = ["us-e1", "eu-w1"] as const;
const DEFAULT_TAGOIO_REGION = "us-e1";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, mcp-session-id, mcp-protocol-version, x-tagoio-region",
};

/**
 * Extracts the token from an Authorization header string.
 * Accepts both "Bearer <token>" and a raw token value.
 */
function extractToken(authHeader: string | undefined | null): string | null {
  if (!authHeader) {
    return null;
  }

  const trimmed = authHeader.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : trimmed;
}

/**
 * Builds a region configuration object from a region identifier.
 *
 * Accepts three forms:
 * - A short region code (e.g. "us-e1", "eu-w1") -> mapped to TagoIO's public endpoints.
 * - A full API URL for a dedicated TagoDeploy instance (e.g. "https://api.acme.tagoio.net")
 *   -> used as-is, with the SSE endpoint derived by swapping the "api." subdomain for "sse.".
 * - A bare dedicated-instance host (e.g. "api.acme.tagoio.net") -> normalized to https.
 */
function buildRegion(region: string): { api: string; sse: string } {
  const trimmed = region.trim();

  // Short region code: no scheme and no host separators (e.g. "us-e1", "eu-w1").
  if (!trimmed.includes(".") && !trimmed.includes("/")) {
    return {
      api: `https://api.${trimmed}.tago.io`,
      sse: `https://sse.${trimmed}.tago.io`,
    };
  }

  // Full URL or bare host pointing at a dedicated instance.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const api = withScheme.replace(/\/+$/, "");
  const sse = api.replace(/:\/\/api\./i, "://sse.");
  return { api, sse };
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

    const verifyAuth = new Network({ token, region });
    await verifyAuth.info();

    const resources = new Resources({ token, region });
    return { resources };
  } catch (error) {
    logger.warn("Token validation failed:", error);

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
  const mcpServer = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: SERVER_INSTRUCTIONS });

  handlerTools(mcpServer, resources, token);
  return mcpServer;
}

export { DEFAULT_TAGOIO_REGION, VALID_REGIONS, CORS_HEADERS, extractToken, buildRegion, validateTagoToken, createMcpServer, isTokenError };

export type { TokenValidationResult, TokenValidationSuccess, TokenValidationError };
