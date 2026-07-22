import { Device, Network, Resources } from "@tago-io/sdk";

import { CredentialContext, CredentialKind, RegionConfig, ServerContext } from "../services/types";
import { logger } from "../utils/logger";
import { describeErrorSafely } from "../utils/safe-error";

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
 * Classifies a TagoIO credential by its prefix: "p-" = profile, "a-" = analysis,
 * unprefixed = device. Every other known current token kind is rejected here,
 * before any client is built or request is sent: Service Authorization tokens
 * carry the "at" prefix (a device token is a UUID, whose hex characters can
 * never start with "at"), and any other letter-dash prefix marks a kind this
 * server does not support.
 */
function classifyCredential(token: string): CredentialKind {
  if (token.startsWith("p-")) {
    return "profile";
  }
  if (token.startsWith("a-")) {
    return "analysis";
  }
  if (token.startsWith("at")) {
    throw new Error('Unsupported token kind "at..." (Service Authorization). Use a Profile ("p-"), Analysis ("a-"), or Device (unprefixed) token.');
  }
  if (/^[A-Za-z]-/.test(token)) {
    throw new Error(`Unsupported token kind "${token.slice(0, 2)}...". Use a Profile ("p-"), Analysis ("a-"), or Device (unprefixed) token.`);
  }
  return "device";
}

/**
 * Maps a short region code to TagoIO's public endpoints. Returns null for
 * anything outside VALID_REGIONS: request headers must never yield arbitrary
 * destinations, or the caller's credential could be forwarded to them (SSRF).
 */
function regionFromCode(code: string): RegionConfig | null {
  if (!(VALID_REGIONS as readonly string[]).includes(code)) {
    return null;
  }
  return {
    api: `https://api.${code}.tago.io`,
    sse: `https://sse.${code}.tago.io`,
  };
}

/**
 * Builds a region from an explicitly configured HTTPS API endpoint (dedicated
 * TagoDeploy instances). Trusted operator startup config only (TAGOIO_API env),
 * never request input. The SSE endpoint is derived by swapping "api." for "sse.".
 */
function regionFromApiUrl(apiUrl: string): RegionConfig {
  const url = new URL(apiUrl);
  if (url.protocol !== "https:") {
    throw new Error(`TAGOIO_API must be an https:// URL, got "${apiUrl}"`);
  }
  const api = url.origin;
  return { api, sse: api.replace(/:\/\/api\./i, "://sse.") };
}

interface TokenValidationSuccess {
  resources: Resources;
  region: RegionConfig;
  /** Spread into the ServerContext; carries the authenticated device identity for Device tokens. */
  credential: CredentialContext;
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
 * How the request-scoped context resolves its region: HTTP/Lambda pass an
 * allowlisted short code (`regionCode`); stdio passes the trusted operator
 * `apiUrl` (a dedicated TagoDeploy instance or a public endpoint).
 */
type BuildContextInput = { token: string; regionCode: string } | { token: string; apiUrl: string };

type BuildContextResult = { ok: true; context: ServerContext } | { ok: false; error: string; statusCode: number };

function isApiUrlInput(input: BuildContextInput): input is { token: string; apiUrl: string } {
  return "apiUrl" in input;
}

/**
 * The single parse-once credential/region boundary for every transport:
 * classifies the credential, resolves the region (strictly from the
 * VALID_REGIONS allowlist for request-supplied codes, or from the trusted
 * operator API URL for stdio), and introspects the token against the TagoIO
 * API. Classification and region failures return 4xx before any outbound
 * request is made.
 *
 * A Device token authenticates exactly one device, so its `/info` response
 * yields the device identity the context must carry: device-data tools
 * enforce every supplied device_id against it. This device-identity guard
 * lives here once for all transports.
 *
 * Runs before buildServer's redaction boundary exists, so it never surfaces
 * raw SDK detail; the credential can be reflected in it.
 */
async function buildServerContext(input: BuildContextInput): Promise<BuildContextResult> {
  const { token } = input;

  let credentialKind: CredentialKind;
  try {
    credentialKind = classifyCredential(token);
  } catch (error) {
    return { ok: false, error: `Unauthorized: ${error instanceof Error ? error.message : String(error)}`, statusCode: 401 };
  }

  let region: RegionConfig;
  if (isApiUrlInput(input)) {
    try {
      region = regionFromApiUrl(input.apiUrl);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error), statusCode: 400 };
    }
  } else {
    const resolved = regionFromCode(input.regionCode.trim());
    if (!resolved) {
      return { ok: false, error: `Invalid x-tagoio-region "${input.regionCode}". Supported regions: ${VALID_REGIONS.join(", ")}.`, statusCode: 400 };
    }
    region = resolved;
  }

  try {
    let credential: CredentialContext;
    if (credentialKind === "device") {
      const info = await new Device({ token, region }).info();
      if (typeof info?.id !== "string" || info.id.length === 0) {
        return { ok: false, error: "Unauthorized: Device token introspection returned no device identity", statusCode: 401 };
      }
      credential = { credentialKind, authenticatedDeviceId: info.id };
    } else if (isApiUrlInput(input)) {
      // stdio dedicated instance: the account route is the contractual check.
      await new Resources({ token, region }).account.info();
      credential = { credentialKind };
    } else {
      // HTTP/Lambda: Network.info is the contractual non-device check.
      await new Network({ token, region }).info();
      credential = { credentialKind };
    }

    const resources = new Resources({ token, region });
    return { ok: true, context: { resources, token, region, ...credential } };
  } catch (error) {
    logger.warn("Token validation failed:", describeErrorSafely(error, [token]));

    if (error instanceof Error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && ["ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED", "ECONNRESET"].includes(code)) {
        return { ok: false, error: "Unable to reach TagoIO API. Check network connectivity.", statusCode: 502 };
      }

      const statusCode = (error as { statusCode?: unknown }).statusCode;
      if (typeof statusCode === "number" && statusCode >= 500) {
        return { ok: false, error: "TagoIO API is temporarily unavailable. Please try again later.", statusCode: 502 };
      }
    }

    return { ok: false, error: "Unauthorized: Invalid TagoIO token", statusCode: 401 };
  }
}

/**
 * HTTP/Lambda adapter over buildServerContext: resolves the region from the
 * request's short code and returns the transport's flat success/error shape.
 */
async function validateTagoToken(token: string, tagoioRegion: string): Promise<TokenValidationResult> {
  const result = await buildServerContext({ token, regionCode: tagoioRegion });
  if (!result.ok) {
    return { error: result.error, statusCode: result.statusCode };
  }
  const { resources, region } = result.context;
  const credential: CredentialContext =
    result.context.credentialKind === "device"
      ? { credentialKind: "device", authenticatedDeviceId: result.context.authenticatedDeviceId }
      : { credentialKind: result.context.credentialKind };
  return { resources, region, credential };
}

export {
  DEFAULT_TAGOIO_REGION,
  VALID_REGIONS,
  CORS_HEADERS,
  buildServerContext,
  classifyCredential,
  extractToken,
  regionFromApiUrl,
  regionFromCode,
  validateTagoToken,
  isTokenError,
};

export type { BuildContextInput, BuildContextResult, TokenValidationResult, TokenValidationSuccess, TokenValidationError };
