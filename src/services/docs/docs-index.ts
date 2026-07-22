import { DOCS_ORIGIN, fetchDocsUrl, isMaxBytesError, readBoundedText } from "./bounded-fetch";

const DOCS_INDEX_URL = `${DOCS_ORIGIN}/llms.txt`;
const DOCS_INDEX_TTL_MS = 15 * 60 * 1000;
const DOCS_INDEX_MAX_BYTES = 2 * 1024 * 1024;

/** `path` is the URL pathname without origin, e.g. "/docs/tagoio/devices/device-token.md". */
interface DocsIndexEntry {
  title: string;
  path: string;
  description: string;
}

interface DocsIndexCache {
  entries: DocsIndexEntry[];
  fetchedAt: number;
}

let docsIndexCache: DocsIndexCache | undefined;

/** Each llms.txt entry looks like: `- [Title](https://docs.tago.io/<path>.md): Description` */
function parseDocsIndex(text: string): DocsIndexEntry[] {
  const entryPattern = /^- \[(.+?)\]\((https:\/\/docs\.tago\.io\/[^\s)]+)\):\s*(.*)$/;
  const entries: DocsIndexEntry[] = [];

  for (const line of text.split("\n")) {
    const match = entryPattern.exec(line.trim());
    if (!match) {
      continue;
    }
    entries.push({ title: match[1], path: new URL(match[2]).pathname, description: match[3] });
  }

  return entries;
}

async function fetchDocsIndex(): Promise<DocsIndexEntry[]> {
  if (docsIndexCache && Date.now() - docsIndexCache.fetchedAt < DOCS_INDEX_TTL_MS) {
    return docsIndexCache.entries;
  }

  const { response, signal } = await fetchDocsUrl(DOCS_INDEX_URL);

  if (response.status !== 200) {
    throw new Error(`The TagoIO docs index at ${DOCS_INDEX_URL} returned HTTP ${response.status}. Retry later; if it persists the docs site may be down.`);
  }

  const text = await readBoundedText(response, DOCS_INDEX_MAX_BYTES, { signal }).catch((error) => {
    if (isMaxBytesError(error)) {
      throw new Error(`The TagoIO docs index response exceeded the ${DOCS_INDEX_MAX_BYTES / (1024 * 1024)} MB size cap and was discarded. Retry later.`);
    }
    throw new Error(`Could not read the TagoIO docs index at ${DOCS_INDEX_URL} (${(error as Error)?.message || error}). Check network access and retry.`);
  });

  const entries = parseDocsIndex(text);
  if (entries.length === 0) {
    throw new Error(`The TagoIO docs index at ${DOCS_INDEX_URL} contained no parseable entries. The docs site may have changed its format; retry later.`);
  }

  docsIndexCache = { entries, fetchedAt: Date.now() };
  return entries;
}

/** Exported for tests. */
function resetDocsIndexCache(): void {
  docsIndexCache = undefined;
}

export { DocsIndexEntry, fetchDocsIndex, parseDocsIndex, resetDocsIndexCache };
