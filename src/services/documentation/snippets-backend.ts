import { isMaxBytesError, readBoundedText } from "../docs/bounded-fetch";

const SNIPPETS_ORIGIN = "https://snippets.tago.io";
const SNIPPETS_FETCH_TIMEOUT_MS = 10_000;
// Mirrors the catalog endpoint's cache-control max-age=600.
const SNIPPET_INDEX_TTL_MS = 10 * 60 * 1000;
const SNIPPET_INDEX_MAX_BYTES = 2 * 1024 * 1024;
const SNIPPET_SOURCE_MAX_BYTES = 1 * 1024 * 1024;
const MAX_REDIRECT_HOPS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const SNIPPET_ANALYSIS_RUNTIMES = ["node-legacy", "python-legacy", "node-rt2025", "python-rt2025", "deno-rt2025"] as const;

type SnippetAnalysisRuntime = (typeof SNIPPET_ANALYSIS_RUNTIMES)[number];
type SnippetCategory = "analysis" | "payload-parser";

/**
 * `file_path` is relative to the category (e.g. "node-rt2025/console.js"),
 * exactly as the index publishes it; source fetches only ever use an
 * index-provided file_path.
 */
interface SnippetIndexEntry {
  id: string;
  title: string;
  description: string;
  language: string;
  tags: string[];
  filename: string;
  file_path: string;
}

interface SnippetIndexCacheEntry {
  entries: SnippetIndexEntry[];
  fetchedAt: number;
}

// Process-scoped by design: the catalog is public and credential-independent,
// so cached indexes are safe to share across requests (same posture as the
// docs llms.txt index cache). Keyed by the canonical validated index URL;
// only successfully parsed indexes are cached, never failures.
const snippetIndexCache = new Map<string, SnippetIndexCacheEntry>();

// Never include the redirect destination (target.href) here: it is external,
// attacker-influenceable content that would flow into tool error output.
function assertAllowedSnippetsUrl(target: URL, requestedUrl: string): void {
  if (target.protocol === "https:" && target.origin === SNIPPETS_ORIGIN) {
    return;
  }
  throw new Error(`Fetching ${requestedUrl} was blocked: it resolves or redirects off the https ${SNIPPETS_ORIGIN} catalog origin. Only the public snippets catalog can be read.`);
}

/**
 * Redirects are followed manually so every hop is origin-checked before it
 * is fetched; the catalog is public, so no credential header is ever sent.
 * `signal` is the operation deadline: every fetch in one tool call shares
 * it, so the total-fetch bound holds across sequential and parallel requests.
 */
async function fetchSnippetsUrl(url: string, signal: AbortSignal): Promise<{ response: Response; signal: AbortSignal }> {
  let currentUrl = new URL(url);

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    assertAllowedSnippetsUrl(currentUrl, url);

    const target = currentUrl.toString();
    const response = await fetch(target, { redirect: "manual", signal }).catch((error) => {
      throw new Error(`Could not fetch ${target} (${(error as Error)?.message || error}). Check network access and retry.`);
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, signal };
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`The snippets catalog at ${target} returned a redirect (HTTP ${response.status}) without a Location header. Retry later.`);
    }
    // Fire-and-forget: cancel() on an intercepted (MSW) body can never settle.
    void response.body?.cancel().catch(() => {});

    try {
      currentUrl = new URL(location, response.url || currentUrl);
    } catch {
      // The raw Location value is external content; never echo it.
      throw new Error(`The snippets catalog at ${target} redirects to an invalid Location. Retry later.`);
    }
  }

  throw new Error(`Fetching ${url} followed more than ${MAX_REDIRECT_HOPS} redirects and was stopped. The snippets catalog may be misconfigured; retry later.`);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Malformed entries are dropped so one bad entry cannot break the whole catalog; missing tags default to []. */
function parseSnippetIndex(raw: unknown, url: string): SnippetIndexEntry[] {
  const snippets = (raw as { snippets?: unknown } | null)?.snippets;
  if (!Array.isArray(snippets)) {
    throw new Error(`The snippets index at ${url} has no "snippets" array. The catalog format may have changed; retry later.`);
  }

  const entries: SnippetIndexEntry[] = [];
  for (const candidate of snippets) {
    const entry = candidate as Record<string, unknown>;
    const requiredStrings = [entry.id, entry.title, entry.description, entry.language, entry.filename, entry.file_path];
    if (requiredStrings.every((field) => typeof field === "string")) {
      entries.push({
        id: entry.id as string,
        title: entry.title as string,
        description: entry.description as string,
        language: entry.language as string,
        tags: isStringArray(entry.tags) ? entry.tags : [],
        filename: entry.filename as string,
        file_path: entry.file_path as string,
      });
    }
  }

  return entries;
}

function indexUrl(category: SnippetCategory, runtime?: SnippetAnalysisRuntime): string {
  if (category === "analysis") {
    if (!runtime || !SNIPPET_ANALYSIS_RUNTIMES.includes(runtime)) {
      throw new Error(`Unknown analysis snippets runtime "${runtime}". Supported runtimes: ${SNIPPET_ANALYSIS_RUNTIMES.join(", ")}.`);
    }
    return `${SNIPPETS_ORIGIN}/analysis/${runtime}.json`;
  }
  return `${SNIPPETS_ORIGIN}/payload-parser/javascript.json`;
}

async function fetchSnippetIndex(
  category: SnippetCategory,
  runtime?: SnippetAnalysisRuntime,
  operationSignal: AbortSignal = AbortSignal.timeout(SNIPPETS_FETCH_TIMEOUT_MS)
): Promise<SnippetIndexEntry[]> {
  const url = indexUrl(category, runtime);

  const cached = snippetIndexCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < SNIPPET_INDEX_TTL_MS) {
    return cached.entries;
  }

  const { response, signal } = await fetchSnippetsUrl(url, operationSignal);

  if (response.status !== 200) {
    throw new Error(`The snippets index at ${url} returned HTTP ${response.status}. Retry later; if it persists the catalog may be down.`);
  }

  const text = await readBoundedText(response, SNIPPET_INDEX_MAX_BYTES, { signal }).catch((error) => {
    if (isMaxBytesError(error)) {
      throw new Error(`The snippets index at ${url} exceeded the ${SNIPPET_INDEX_MAX_BYTES / (1024 * 1024)} MiB size cap and was discarded. Retry later.`);
    }
    throw new Error(`Could not read the snippets index at ${url} (${(error as Error)?.message || error}). Check network access and retry.`);
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`The snippets index at ${url} is not valid JSON. The catalog format may have changed; retry later.`);
  }

  const entries = parseSnippetIndex(parsed, url);
  snippetIndexCache.set(url, { entries, fetchedAt: Date.now() });
  return entries;
}

/** Exported for tests. */
function resetSnippetIndexCache(): void {
  snippetIndexCache.clear();
}

/**
 * `filePath` must be a `file_path` taken verbatim from a fetched index (the
 * tools enforce this); traversal-shaped paths are rejected defensively here
 * as well.
 */
async function fetchSnippetSource(category: SnippetCategory, filePath: string, operationSignal: AbortSignal = AbortSignal.timeout(SNIPPETS_FETCH_TIMEOUT_MS)): Promise<string> {
  if (filePath.includes("..") || filePath.startsWith("/") || filePath.includes("://")) {
    throw new Error(`The snippets index entry has an unsafe file path ("${filePath}") and was not fetched. Report this catalog entry to TagoIO.`);
  }

  const url = `${SNIPPETS_ORIGIN}/${category}/${filePath}`;
  const { response, signal } = await fetchSnippetsUrl(url, operationSignal);

  if (response.status !== 200) {
    throw new Error(`The example file at ${url} returned HTTP ${response.status}. Run search_code_examples again; the catalog may have changed.`);
  }

  return readBoundedText(response, SNIPPET_SOURCE_MAX_BYTES, { signal }).catch((error) => {
    if (isMaxBytesError(error)) {
      throw new Error(`The example file at ${url} is larger than the 1 MiB limit and cannot be read through this tool.`);
    }
    throw new Error(`Could not read the example file at ${url} (${(error as Error)?.message || error}). Check network access and retry.`);
  });
}

export {
  fetchSnippetIndex,
  fetchSnippetSource,
  resetSnippetIndexCache,
  SNIPPET_ANALYSIS_RUNTIMES,
  SNIPPETS_FETCH_TIMEOUT_MS,
  SNIPPETS_ORIGIN,
  SnippetAnalysisRuntime,
  SnippetCategory,
  SnippetIndexEntry,
};
