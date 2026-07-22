import { RegionConfig } from "../types";
import { describeErrorSafely } from "../../utils/safe-error";

/**
 * Narrow transport for the two custom-widget requests the SDK does not wrap:
 * the widget source upload POST and the signed source-URL GET. The SDK
 * boundary stays the rule everywhere else; this module exists ONLY because
 * `@tago-io/sdk` has no wrapper for the upload route and its
 * `getFileURLSigned` rejects the widget source path shape. It is deliberately
 * NOT a generic authenticated-request escape hatch: both URLs are built here
 * from the validated region configuration and schema-constrained 24-character
 * ids; no caller-supplied URL or path ever reaches a request.
 */

const TRANSPORT_TIMEOUT_MS = 10_000;
const RESOURCE_ID_PATTERN = /^[0-9a-f]{24}$/;

/** Every bundle outcome arrives as HTTP 200 with this result shape. */
interface WidgetUploadOutcome {
  url: string | null;
  artifact_hash: string | null;
  artifact_url: string | null;
  bytes: number | null;
  success: boolean;
  error: string | null;
  warnings: string[];
}

type WidgetUploadResponse =
  /** HTTP 200: the bundler ran (or was skipped); success and failure both land here. */
  | { kind: "outcome"; outcome: WidgetUploadOutcome }
  /** Thrown-error envelope (HTTP 4xx): controlled server message, e.g. quota or auth denial. */
  | { kind: "request_error"; message: string; httpStatus: number }
  /** HTTP 429: per-minute upload rate limit. */
  | { kind: "rate_limited"; retryAfterSeconds: number | null };

interface TransportContext {
  token: string;
  region: RegionConfig;
}

function assertResourceId(name: string, value: string): void {
  if (!RESOURCE_ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${name}: expected a 24-character resource ID.`);
  }
}

function transportFailure(operation: string, caught: unknown, knownSecrets: Array<string | undefined>): Error {
  return new Error(`${operation} failed: ${describeErrorSafely(caught, knownSecrets)}`);
}

async function fetchWithDeadline(url: string, init: RequestInit): Promise<Response> {
  return await fetch(url, { ...init, signal: AbortSignal.timeout(TRANSPORT_TIMEOUT_MS), redirect: "error" });
}

function isEnvelope(value: unknown): value is { status: boolean; result?: unknown; message?: unknown } {
  return typeof value === "object" && value !== null && typeof (value as { status?: unknown }).status === "boolean";
}

function parseUploadOutcome(result: unknown): WidgetUploadOutcome {
  if (typeof result !== "object" || result === null) {
    throw new Error("the API returned an unrecognized upload result shape");
  }
  const record = result as Record<string, unknown>;
  return {
    url: typeof record.url === "string" ? record.url : null,
    artifact_hash: typeof record.artifact_hash === "string" ? record.artifact_hash : null,
    artifact_url: typeof record.artifact_url === "string" ? record.artifact_url : null,
    bytes: typeof record.bytes === "number" ? record.bytes : null,
    success: record.success === true,
    error: typeof record.error === "string" ? record.error : null,
    warnings: Array.isArray(record.warnings) ? record.warnings.filter((warning): warning is string => typeof warning === "string") : [],
  };
}

/**
 * `file` is the base64-encoded widget source; the calling tool owns the
 * encoding, the size cap, and redaction of the plaintext form.
 */
async function postWidgetSourceUpload(context: TransportContext, params: { dashboardId: string; widgetId: string; file: string; fileName: string }): Promise<WidgetUploadResponse> {
  assertResourceId("dashboard ID", params.dashboardId);
  assertResourceId("widget ID", params.widgetId);
  const knownSecrets = [context.token, params.file];

  let response: Response;
  try {
    response = await fetchWithDeadline(`${context.region.api}/dashboard/${params.dashboardId}/widget/${params.widgetId}/upload`, {
      method: "POST",
      headers: { "content-type": "application/json", token: context.token },
      body: JSON.stringify({ file: params.file, file_name: params.fileName }),
    });
  } catch (caught) {
    throw transportFailure("Widget source upload", caught, knownSecrets);
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
    return { kind: "rate_limited", retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null };
  }

  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch (caught) {
    throw transportFailure("Widget source upload", caught, knownSecrets);
  }
  if (!isEnvelope(envelope)) {
    throw new Error(`Widget source upload failed: the API returned an unrecognized response (HTTP ${response.status}).`);
  }

  if (!envelope.status) {
    const message = typeof envelope.message === "string" ? envelope.message : `HTTP ${response.status}`;
    return { kind: "request_error", message: describeErrorSafely(message, knownSecrets), httpStatus: response.status };
  }

  try {
    return { kind: "outcome", outcome: parseUploadOutcome(envelope.result) };
  } catch (caught) {
    throw transportFailure("Widget source upload", caught, knownSecrets);
  }
}

/**
 * GET /file/:profile/widgets/:widget_id.tsx?noRedirect=true resolves a
 * short-lived signed URL for the widget's source file, bypassing the ~60 s
 * Files CDN cache (read-after-write freshness). The path deliberately omits
 * the `storage` segment that appears in `display.url`; the API injects it.
 * The returned signed URL is a secret: callers must redact it from any error.
 */
async function resolveSignedWidgetSourceUrl(context: TransportContext, params: { profileId: string; widgetId: string }): Promise<string> {
  assertResourceId("profile ID", params.profileId);
  assertResourceId("widget ID", params.widgetId);
  const knownSecrets = [context.token];

  let response: Response;
  try {
    response = await fetchWithDeadline(`${context.region.api}/file/${params.profileId}/widgets/${params.widgetId}.tsx?noRedirect=true`, {
      method: "GET",
      headers: { token: context.token },
    });
  } catch (caught) {
    throw transportFailure("Widget source URL resolution", caught, knownSecrets);
  }

  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch (caught) {
    throw transportFailure("Widget source URL resolution", caught, knownSecrets);
  }
  if (!isEnvelope(envelope)) {
    throw new Error(`Widget source URL resolution failed: the API returned an unrecognized response (HTTP ${response.status}).`);
  }
  if (!envelope.status || typeof envelope.result !== "string" || envelope.result.length === 0) {
    const message = typeof envelope.message === "string" ? envelope.message : `HTTP ${response.status}`;
    const error = new Error(`Widget source URL resolution failed: ${describeErrorSafely(message, knownSecrets)}`);
    (error as { httpStatus?: number }).httpStatus = response.status;
    throw error;
  }

  return envelope.result;
}

export { postWidgetSourceUpload, resolveSignedWidgetSourceUrl, TRANSPORT_TIMEOUT_MS };
export type { WidgetUploadOutcome, WidgetUploadResponse };
