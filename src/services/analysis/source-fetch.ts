import { LookupAddress, lookup as nodeDnsLookup } from "node:dns";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
// Module-object import (not a named import): test interceptors patch the
// https module's request property, and only a call-time lookup sees the patch.
import https from "node:https";
import { createGunzip } from "node:zlib";
import ipaddr from "ipaddr.js";

/**
 * Bounded, SSRF-guarded fetch for analysis script download URLs. The signed
 * URL points at an arbitrary storage host, so every hop is pinned to publicly
 * routable addresses through a validating DNS lookup handed to the socket, so
 * the socket can only ever connect to an address that passed validation.
 * Every failure is a controlled error naming only the failure category and
 * HTTP status class; the URL, query string, and resolved addresses never
 * appear in messages.
 *
 * The public-address gate is backed by ipaddr.js: an address is fetchable only
 * when its range is unicast AND it sits in globally routable space. ipaddr.js
 * classifies loopback, private, link-local, unique-local, CGNAT, multicast,
 * broadcast, reserved, IPv4-mapped, NAT64 (rfc6052/rfc6145), 6to4, and teredo
 * natively; two positive constraints stay on top of it because its unicast
 * label is broader than global reachability. IPv4 must be a four-part decimal
 * (rejecting shorthand like "1.2.3"), and IPv6 must fall inside global-unicast
 * 2000::/3 (rejecting reserved outer blocks ipaddr.js still labels unicast).
 * IPv4-mapped and NAT64 literals carrying a public embedded IPv4 are rejected
 * outright rather than followed to the embedded address.
 */

const MAX_REDIRECT_HOPS = 3;
const MAX_RAW_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 1024 * 1024;
const SOURCE_FETCH_TIMEOUT_MS = 10_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SOURCE_FETCH_ERROR_NAME = "AnalysisSourceFetchError";
const GZIP_MAGIC = [0x1f, 0x8b] as const;

type DnsLookupFn = (hostname: string, options: { all: true }, callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;

interface SourceFetchOptions {
  /** Injectable DNS resolver seam for tests; defaults to node:dns lookup. */
  lookup?: DnsLookupFn;
  /** Total deadline across all hops, headers, and body. */
  timeoutMs?: number;
}

interface SourceFetchResult {
  source: string;
  wasGzip: boolean;
  rawBytes: number;
}

/** Controlled failure: category only, never the URL, host, or addresses. */
function fetchFailure(category: string): Error {
  const error = new Error(`Analysis script fetch failed: ${category}.`);
  error.name = SOURCE_FETCH_ERROR_NAME;
  return error;
}

function isControlledFetchError(error: unknown): error is Error {
  return error instanceof Error && error.name === SOURCE_FETCH_ERROR_NAME;
}

/**
 * Rejects any IP literal that is not publicly routable. Unparseable input is
 * rejected too (fail closed). Exported pure so the matrix is directly testable.
 */
function assertPublicAddress(ip: string): void {
  const literal = ip.trim();

  let parsed: ReturnType<typeof ipaddr.parse>;
  try {
    parsed = ipaddr.parse(literal);
  } catch {
    throw fetchFailure("the host resolved to an unrecognized address");
  }

  if (parsed instanceof ipaddr.IPv4) {
    // isValidFourPartDecimal rejects the shorthand forms ipaddr.js otherwise
    // accepts (e.g. "1.2.3" as 1.2.0.3), which are never a storage host.
    if (parsed.range() !== "unicast" || !ipaddr.IPv4.isValidFourPartDecimal(literal)) {
      throw fetchFailure("the host resolved to a non-public address");
    }
    return;
  }

  // A zoned IPv6 literal names a local interface, never a routable host.
  if (parsed.zoneId !== undefined) {
    throw fetchFailure("the host resolved to a non-public address");
  }
  // ipaddr.js labels reserved outer blocks (4000::/2, 8000::/1, …) as unicast,
  // so the 2000::/3 positive gate stays: IANA allocates global unicast only
  // from there. ipaddr.js natively rejects everything else non-routable
  // (ULA, link-local, multicast, IPv4-mapped, NAT64, 6to4, teredo, documentation).
  if (parsed.range() !== "unicast" || (parsed.parts[0] & 0xe000) !== 0x2000) {
    throw fetchFailure("the host resolved to a non-public address");
  }
}

type NodeLookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * Wraps a dns lookup so ANY resolved address failing the public-address check
 * errbacks. Nothing is returned to the socket, so the connection can only be
 * made to a fully validated result set (pinning, not preflight).
 */
function makeValidatingLookup(baseLookup: DnsLookupFn = nodeDnsLookup as unknown as DnsLookupFn) {
  return function validatingLookup(hostname: string, optionsOrCallback: NodeLookupCallback | { all?: boolean }, maybeCallback?: NodeLookupCallback): void {
    const callback = (typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback) as NodeLookupCallback;
    const options = typeof optionsOrCallback === "object" && optionsOrCallback !== null ? optionsOrCallback : {};

    baseLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, []);
        return;
      }
      if (!Array.isArray(addresses) || addresses.length === 0) {
        callback(fetchFailure("DNS resolution returned no addresses") as NodeJS.ErrnoException, []);
        return;
      }
      for (const entry of addresses) {
        try {
          assertPublicAddress(entry.address);
        } catch (validationError) {
          callback(validationError as NodeJS.ErrnoException, []);
          return;
        }
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

/** Validates scheme, userinfo, and IP-literal hosts before any I/O for the hop. */
function assertFetchableUrl(target: URL): void {
  if (target.protocol !== "https:") {
    throw fetchFailure("only https URLs can be fetched");
  }
  if (target.username !== "" || target.password !== "") {
    throw fetchFailure("URLs with embedded credentials are not allowed");
  }
  // Node never invokes a custom lookup for IP-literal hosts, so the validating
  // lookup cannot pin them. Validate the literal itself (URL.hostname keeps
  // IPv6 brackets).
  const literalHost = target.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literalHost) !== 0) {
    assertPublicAddress(literalHost);
  }
}

function requestOnce(target: URL, lookup: ReturnType<typeof makeValidatingLookup>, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    // No cookies, authorization, or referrer: the TagoIO credential must never
    // reach the storage host. identity keeps transport encoding out of play.
    const clientRequest = https.request(target, { method: "GET", lookup, signal, headers: { "accept-encoding": "identity" } }, resolve);
    clientRequest.on("error", (error) => {
      if (isControlledFetchError(error)) {
        reject(error);
        return;
      }
      if (signal.aborted && isControlledFetchError(signal.reason)) {
        reject(signal.reason);
        return;
      }
      reject(fetchFailure("network transport failure"));
    });
    clientRequest.end();
  });
}

async function readBoundedBody(response: IncomingMessage, signal: AbortSignal): Promise<Buffer> {
  const declaredLength = Number(response.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RAW_BYTES) {
    response.destroy();
    throw fetchFailure(`the response exceeds the ${MAX_RAW_BYTES} byte limit`);
  }

  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  try {
    for await (const chunk of response) {
      const buffer = chunk as Buffer;
      receivedBytes += buffer.byteLength;
      if (receivedBytes > MAX_RAW_BYTES) {
        response.destroy();
        throw fetchFailure(`the response exceeds the ${MAX_RAW_BYTES} byte limit`);
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (isControlledFetchError(error)) {
      throw error;
    }
    if (signal.aborted && isControlledFetchError(signal.reason)) {
      throw signal.reason;
    }
    throw fetchFailure("the connection failed while reading the response body");
  }
  return Buffer.concat(chunks);
}

/** Decompresses exactly one gzip pass with a hard output cap. */
function gunzipBounded(raw: Buffer, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const chunks: Buffer[] = [];
    let producedBytes = 0;

    gunzip.on("data", (chunk: Buffer) => {
      producedBytes += chunk.byteLength;
      if (producedBytes > maxBytes) {
        gunzip.destroy();
        reject(fetchFailure(`the decompressed script exceeds the ${maxBytes} byte limit`));
        return;
      }
      chunks.push(chunk);
    });
    gunzip.on("error", () => reject(fetchFailure("the gzip artifact is corrupt or truncated")));
    gunzip.on("end", () => resolve(Buffer.concat(chunks)));
    gunzip.end(raw);
  });
}

/**
 * Fetches an analysis script source from a signed download URL under the full
 * contract: https-only, public-address DNS pinning on every hop, at most 3
 * manual redirects, identity transport encoding, 2 MiB raw / 1 MiB source
 * caps, single gzip artifact pass, fatal UTF-8 decoding, and one total
 * deadline covering everything.
 */
async function fetchAnalysisSource(url: string, options: SourceFetchOptions = {}): Promise<SourceFetchResult> {
  const lookup = makeValidatingLookup(options.lookup);
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? SOURCE_FETCH_TIMEOUT_MS;
  const deadline = setTimeout(() => controller.abort(fetchFailure(`the download exceeded the ${timeoutMs} ms deadline`)), timeoutMs);

  try {
    let currentUrl: URL;
    try {
      currentUrl = new URL(url);
    } catch {
      throw fetchFailure("the download URL is not a valid URL");
    }

    let response: IncomingMessage | undefined;
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
      assertFetchableUrl(currentUrl);
      const hopResponse = await requestOnce(currentUrl, lookup, controller.signal);
      const status = hopResponse.statusCode ?? 0;

      if (!REDIRECT_STATUSES.has(status)) {
        response = hopResponse;
        break;
      }

      // A redirect body is never read: destroy it immediately so an endless
      // or slow discarded body cannot keep the socket flowing after the tool
      // settles. This covers the hop-limit, missing-Location, and
      // invalid-Location exits below too.
      hopResponse.destroy();
      if (hop === MAX_REDIRECT_HOPS) {
        throw fetchFailure(`the download followed more than ${MAX_REDIRECT_HOPS} redirects`);
      }
      const location = hopResponse.headers.location;
      if (!location) {
        throw fetchFailure("a redirect response carried no Location header");
      }
      try {
        currentUrl = new URL(location, currentUrl);
      } catch {
        throw fetchFailure("a redirect pointed at an invalid URL");
      }
    }

    if (!response) {
      throw fetchFailure(`the download followed more than ${MAX_REDIRECT_HOPS} redirects`);
    }

    const status = response.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      // The error body is never read; tear it down instead of draining it.
      response.destroy();
      throw fetchFailure(`the storage host returned an HTTP ${Math.floor(status / 100)}xx response`);
    }

    const contentEncoding = response.headers["content-encoding"];
    if (contentEncoding !== undefined && (typeof contentEncoding !== "string" || contentEncoding.trim().toLowerCase() !== "identity")) {
      response.destroy();
      throw fetchFailure("the storage host used an unsupported transport encoding");
    }

    const raw = await readBoundedBody(response, controller.signal);
    const wasGzip = raw.byteLength >= 2 && raw[0] === GZIP_MAGIC[0] && raw[1] === GZIP_MAGIC[1];
    const decoded = wasGzip ? await gunzipBounded(raw, MAX_SOURCE_BYTES) : raw;
    if (!wasGzip && decoded.byteLength > MAX_SOURCE_BYTES) {
      throw fetchFailure(`the script exceeds the ${MAX_SOURCE_BYTES} byte limit`);
    }

    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
    } catch {
      throw fetchFailure("the script content is not valid UTF-8");
    }

    return { source, wasGzip, rawBytes: raw.byteLength };
  } finally {
    clearTimeout(deadline);
  }
}

export {
  MAX_RAW_BYTES,
  MAX_REDIRECT_HOPS,
  MAX_SOURCE_BYTES,
  SOURCE_FETCH_TIMEOUT_MS,
  SourceFetchOptions,
  SourceFetchResult,
  assertPublicAddress,
  fetchAnalysisSource,
  isControlledFetchError,
  makeValidatingLookup,
};
