import { isIP } from "node:net";
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
 * TagoDeploy instances). Trusted operator startup config only (TAGOIO_API env).
 * The SSE endpoint is derived by swapping "api." for "sse.".
 */
function regionFromApiUrl(apiUrl: string): RegionConfig {
  const url = new URL(apiUrl);
  if (url.protocol !== "https:") {
    throw new Error(`TAGOIO_API must be an https:// URL, got "${apiUrl}"`);
  }
  const api = url.origin;
  return { api, sse: api.replace(/:\/\/api\./i, "://sse.") };
}

/**
 * Suffixes that only ever name something on the server's own network, never a
 * TagoDeploy instance. Checked as labels, so "my.local.example.com" passes and
 * "db.local" does not.
 */
const NON_ROUTABLE_SUFFIXES = ["localhost", "local", "internal", "intranet", "lan", "home", "corp", "arpa"] as const;

/**
 * Builds a region from a request-supplied dedicated-instance endpoint. A
 * TagoDeploy customer can custom-domain their API, so there is no host
 * allowlist and no DNS shape that could recognize a legitimate instance: the
 * caller names the endpoint, and the token they also supplied is what goes
 * there. That is the caller using this server to reach their own deployment,
 * not a crossed trust boundary.
 *
 * What this still refuses is the caller aiming the server at the server's own
 * surroundings and reading the answer back through tool output: the scheme must
 * be https (which alone rules out the http-only metadata endpoints), the host
 * must be a real multi-label domain rather than an IP literal or a
 * single-label/internal-suffix name, the port must be the default, and URL
 * userinfo is refused so the endpoint can never smuggle a second credential.
 * A bare host is accepted and normalized to https; an explicit http:// URL is
 * not, since silently upgrading it would misreport what was requested.
 */
function regionFromInstanceEndpoint(value: string): RegionConfig | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return null;
  }
  // url.port is empty when the default port is used, including an explicit ":443".
  if (url.port.length > 0) {
    return null;
  }

  // URL keeps IPv6 literals bracketed; strip them so isIP sees the address.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0) {
    return null;
  }

  const labels = host.split(".");
  if (labels.length < 2 || labels.some((label) => label.length === 0)) {
    return null;
  }
  if ((NON_ROUTABLE_SUFFIXES as readonly string[]).includes(labels[labels.length - 1])) {
    return null;
  }

  // origin drops any path, query, and fragment the caller sent along.
  const api = url.origin;
  return { api, sse: api.replace(/:\/\/api\./i, "://sse.") };
}

interface ResolvedRegion {
  region: RegionConfig;
  /**
   * A dedicated (TagoDeploy) instance rather than a public region. It has no
   * public network catalog, so token introspection uses the account route.
   */
  dedicated: boolean;
}

/**
 * Resolves the request-supplied region value (`x-tagoio-region`): an
 * allowlisted short code, or a dedicated TagoDeploy endpoint. Returns null for
 * anything that is neither, so the caller can answer 400 before any outbound
 * request. A short code carries no host or path separators; anything else is
 * read as an endpoint and passed through regionFromInstanceEndpoint, which is
 * where a typo like "us-e2.tago.io" or a hostile "https://127.0.0.1" dies.
 */
function resolveRequestRegion(value: string): ResolvedRegion | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (!/[.:/]/.test(trimmed)) {
    const region = regionFromCode(trimmed);
    return region ? { region, dedicated: false } : null;
  }

  const region = regionFromInstanceEndpoint(trimmed);
  return region ? { region, dedicated: true } : null;
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
 * How the request-scoped context resolves its region: the request-supplied
 * `requestRegion` (an allowlisted short code or a dedicated TagoDeploy
 * endpoint), or the operator-configured `apiUrl`. stdio always passes `apiUrl`;
 * HTTP/Lambda pass it too when the deployment is pinned by TAGOIO_API, and
 * `requestRegion` otherwise.
 */
type BuildContextInput = { token: string; requestRegion: string } | { token: string; apiUrl: string };

type BuildContextResult = { ok: true; context: ServerContext } | { ok: false; error: string; statusCode: number };

function isApiUrlInput(input: BuildContextInput): input is { token: string; apiUrl: string } {
  return "apiUrl" in input;
}

/**
 * The single parse-once credential/region boundary for every transport:
 * classifies the credential, resolves the region (from the operator API URL
 * when one is configured, otherwise from the request value: the VALID_REGIONS
 * allowlist or a dedicated TagoDeploy endpoint), and introspects the token
 * against the TagoIO API. Classification and region failures return 4xx before
 * any outbound request is made.
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
  let dedicated: boolean;
  if (isApiUrlInput(input)) {
    try {
      region = regionFromApiUrl(input.apiUrl);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error), statusCode: 400 };
    }
    dedicated = true;
  } else {
    const resolved = resolveRequestRegion(input.requestRegion);
    if (!resolved) {
      return {
        ok: false,
        error: `Invalid x-tagoio-region "${input.requestRegion}". Use a public region (${VALID_REGIONS.join(", ")}) or a dedicated TagoDeploy API endpoint (for example "https://api.acme.tagoio.net").`,
        statusCode: 400,
      };
    }
    region = resolved.region;
    dedicated = resolved.dedicated;
  }

  try {
    let credential: CredentialContext;
    if (credentialKind === "device") {
      const info = await new Device({ token, region }).info();
      if (typeof info?.id !== "string" || info.id.length === 0) {
        return { ok: false, error: "Unauthorized: Device token introspection returned no device identity", statusCode: 401 };
      }
      credential = { credentialKind, authenticatedDeviceId: info.id };
    } else if (dedicated) {
      // Any dedicated instance, however it was named (operator TAGOIO_API or
      // the region header): the account route is the contractual check.
      // Networks are a public-catalog concept, so a dedicated deployment is
      // introspected the same way stdio always was.
      await new Resources({ token, region }).account.info();
      credential = { credentialKind };
    } else {
      // A public region reached by short code: Network.info is the contractual
      // non-device check.
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
 * request and returns the transport's flat success/error shape.
 *
 * `apiUrl` is operator startup configuration (the `TAGOIO_API` env var), set
 * when this server runs beside one dedicated TagoDeploy instance. When present
 * it pins every request to that endpoint and the region header is not consulted
 * at all. When absent, `tagoioRegion` is resolved by resolveRequestRegion: a
 * VALID_REGIONS short code, or the caller's own dedicated instance endpoint,
 * which is how one unpinned deployment serves many TagoDeploy customers.
 */
async function validateTagoToken(token: string, tagoioRegion: string, apiUrl?: string): Promise<TokenValidationResult> {
  const result = await buildServerContext(apiUrl ? { token, apiUrl } : { token, requestRegion: tagoioRegion });
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
  regionFromInstanceEndpoint,
  resolveRequestRegion,
  validateTagoToken,
  isTokenError,
};

export type { BuildContextInput, BuildContextResult, ResolvedRegion, TokenValidationResult, TokenValidationSuccess, TokenValidationError };
