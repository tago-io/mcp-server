const DOCS_ORIGIN = "https://docs.tago.io";
const DOCS_FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECT_HOPS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_BYTES_ERROR_NAME = "DocsMaxBytesExceededError";

interface DocsFetchResult {
  response: Response;
  /** The timeout signal driving the fetch; pass it to readBoundedText so body reads stay bounded. */
  signal: AbortSignal;
}

function maxBytesError(maxBytes: number): Error {
  const error = new Error(`Response body exceeded the ${maxBytes} byte limit.`);
  error.name = MAX_BYTES_ERROR_NAME;
  return error;
}

function isMaxBytesError(error: unknown): boolean {
  return error instanceof Error && error.name === MAX_BYTES_ERROR_NAME;
}

function assertAllowedDocsUrl(target: URL, requestedUrl: string): void {
  if (target.protocol === "https:" && target.origin === DOCS_ORIGIN) {
    return;
  }
  throw new Error(
    `Fetching ${requestedUrl} was blocked: it resolves or redirects to ${target.href}, which is not an https page on ${DOCS_ORIGIN}. Only official docs pages can be read.`
  );
}

/** Redirects are followed manually so every hop is HTTPS/origin-checked before it is fetched. */
async function fetchDocsUrl(url: string, timeoutMs: number = DOCS_FETCH_TIMEOUT_MS): Promise<DocsFetchResult> {
  const signal = AbortSignal.timeout(timeoutMs);
  let currentUrl = new URL(url);

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    assertAllowedDocsUrl(currentUrl, url);

    const target = currentUrl.toString();
    const response = await fetch(target, { redirect: "manual", signal }).catch((error) => {
      throw new Error(`Could not fetch ${target} (${(error as Error)?.message || error}). Check network access and retry.`);
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, signal };
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`The page at ${target} returned a redirect (HTTP ${response.status}) without a Location header. Retry later.`);
    }
    // Fire-and-forget: cancel() on an intercepted (MSW) body can never settle.
    void response.body?.cancel().catch(() => {});

    try {
      currentUrl = new URL(location, response.url || currentUrl);
    } catch {
      throw new Error(`The page at ${target} redirects to an invalid Location ("${location}"). Retry later.`);
    }
  }

  throw new Error(`Fetching ${url} followed more than ${MAX_REDIRECT_HOPS} redirects and was stopped. The docs site may be misconfigured; retry later.`);
}

function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal?: AbortSignal): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!signal) {
    return reader.read();
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new Error("The request was aborted."));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error("The request was aborted."));
    signal.addEventListener("abort", onAbort, { once: true });
    reader
      .read()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/**
 * Cancels the stream as soon as maxBytes of actual UTF-8 is exceeded, so a
 * chunked response never buffers past the cap. Oversize throws an error
 * matching isMaxBytesError.
 */
async function readBoundedText(response: Response, maxBytes: number, options: { signal?: AbortSignal } = {}): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw maxBytesError(maxBytes);
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let receivedBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await readChunk(reader, options.signal);
      if (done) {
        break;
      }
      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) {
        throw maxBytesError(maxBytes);
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  }

  return text + decoder.decode();
}

export { DOCS_FETCH_TIMEOUT_MS, DOCS_ORIGIN, DocsFetchResult, fetchDocsUrl, isMaxBytesError, readBoundedText };
