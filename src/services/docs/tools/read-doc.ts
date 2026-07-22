import { z } from "zod/v3";

import { IToolConfig, ServerContext } from "../../types";
import { DOCS_ORIGIN, fetchDocsUrl, isMaxBytesError, readBoundedText } from "../bounded-fetch";
import { fetchDocsIndex } from "../docs-index";

const DOC_MAX_BYTES = 1 * 1024 * 1024;
const DOC_PAGE_TTL_MS = 15 * 60 * 1000;
const DOC_PAGE_CACHE_MAX_ENTRIES = 20;

interface DocPageCacheEntry {
  body: string;
  fetchedAt: number;
}

// Process-scoped by design: doc pages are public and credential-independent
// (same posture as the docs index cache). Only validated markdown bodies are
// cached, never failures. LRU via Map insertion order: hits re-insert,
// inserts evict the oldest key.
const docPageCache = new Map<string, DocPageCacheEntry>();

const readDocBaseSchema = z.object({
  path: z.string().min(1).describe('A doc path returned by search_docs, e.g. "/docs/tagoio/devices/device-token.md". Not a full URL.'),
});

type ReadDocSchema = z.infer<typeof readDocBaseSchema>;

function looksLikeMarkdown(contentType: string, body: string): boolean {
  if (contentType.includes("text/markdown") || contentType.includes("text/plain")) {
    return true;
  }
  const trimmed = body.trimStart();
  return trimmed.startsWith("---") || trimmed.startsWith("#");
}

async function readDocTool(_context: ServerContext, params: ReadDocSchema): Promise<string> {
  const { path } = params;

  if (path.includes("://")) {
    throw new Error(`read_doc takes a doc path like "/docs/tagoio/devices/device-token.md", not a full URL. Use a path returned by search_docs.`);
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // Only paths present in the fetched index are fetched, so this tool can
  // never be steered to arbitrary URLs.
  const entries = await fetchDocsIndex();
  const entry = entries.find((candidate) => candidate.path === normalizedPath);
  if (!entry) {
    throw new Error(`"${normalizedPath}" is not in the TagoIO docs index (stale index or unknown path). Run search_docs to get current doc paths.`);
  }

  const url = `${DOCS_ORIGIN}${normalizedPath}`;

  const cached = docPageCache.get(normalizedPath);
  if (cached && Date.now() - cached.fetchedAt < DOC_PAGE_TTL_MS) {
    docPageCache.delete(normalizedPath);
    docPageCache.set(normalizedPath, cached);
    return `Source: ${url}\n\n${cached.body}`;
  }

  const { response, signal } = await fetchDocsUrl(url);

  if (response.status !== 200) {
    throw new Error(`The doc page at ${url} returned HTTP ${response.status}. Run search_docs again; the page may have moved.`);
  }

  const body = await readBoundedText(response, DOC_MAX_BYTES, { signal }).catch((error) => {
    if (isMaxBytesError(error)) {
      throw new Error(`The doc page at ${url} is larger than the 1 MB limit and cannot be read through this tool.`);
    }
    throw new Error(`Could not read the doc page at ${url} (${(error as Error)?.message || error}). Check network access and retry.`);
  });

  if (!looksLikeMarkdown(response.headers.get("content-type") ?? "", body)) {
    throw new Error(`The doc page at ${url} did not return markdown content (it may be a missing page). Run search_docs to get current doc paths.`);
  }

  docPageCache.delete(normalizedPath);
  docPageCache.set(normalizedPath, { body, fetchedAt: Date.now() });
  if (docPageCache.size > DOC_PAGE_CACHE_MAX_ENTRIES) {
    const oldestPath = docPageCache.keys().next().value;
    if (oldestPath !== undefined) {
      docPageCache.delete(oldestPath);
    }
  }

  return `Source: ${url}\n\n${body}`;
}

/** Exported for tests. */
function resetDocPageCache(): void {
  docPageCache.clear();
}

const readDocConfigJSON: IToolConfig = {
  name: "read_doc",
  description: `Reads one page of the official TagoIO documentation (docs.tago.io) as markdown and returns its full content, prefixed with a Source line.

The path parameter must be a doc path returned by the search_docs tool (e.g. "/docs/tagoio/devices/device-token.md"); arbitrary paths and full URLs are rejected. Call search_docs first to discover paths, then read the most relevant pages. Use this to quote exact limits, field names, and behaviors from the official docs instead of relying on memory.

<example>
{"path": "/docs/tagoio/devices/device-token.md"}
</example>`,
  parameters: readDocBaseSchema.shape,
  title: "Read TagoIO Doc Page",
  annotations: { readOnlyHint: true, openWorldHint: true },
  mutationClass: "read",
  tool: readDocTool,
};

export { readDocConfigJSON, resetDocPageCache };
