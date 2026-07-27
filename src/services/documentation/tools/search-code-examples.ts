import { z } from "zod/v3";

import { invalidParamError } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { fetchSnippetIndex, SNIPPET_ANALYSIS_RUNTIMES, SNIPPETS_FETCH_TIMEOUT_MS, SnippetAnalysisRuntime, SnippetIndexEntry } from "../snippets-backend";

const MAX_RESULTS = 10;
// Output bounds: individually valid multi-megabyte indexes must not compound
// into a multi-megabyte tool result. All limits are UTF-8 bytes, not chars.
const MAX_QUERY_BYTES = 512;
const MAX_TITLE_BYTES = 160;
const MAX_DESCRIPTION_BYTES = 400;
const MAX_FILENAME_BYTES = 120;
const MAX_RESPONSE_BYTES = 32 * 1024;

const searchCodeExamplesBaseSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(MAX_QUERY_BYTES)
    .describe('Search terms matched against example titles, tags, descriptions, and filenames, e.g. "create a device" or "decode base64 payload".'),
  type: z.enum(["analysis", "payload-parser"]).describe("The kind of code you are writing: Analysis script or Payload Parser."),
  runtime: z.enum(SNIPPET_ANALYSIS_RUNTIMES).optional().describe('Restrict Analysis examples to one runtime. Omit to search all runtimes. Only valid with type "analysis".'),
});

type SearchCodeExamplesSchema = z.infer<typeof searchCodeExamplesBaseSchema>;

interface ScoredEntry {
  entry: SnippetIndexEntry;
  runtime: string;
  score: number;
  matchedTokens: number;
}

// Filler words carry no signal about which example is being asked for; only
// the remaining terms count toward match coverage. Deliberately small and
// generic, never tuned to specific queries.
const QUERY_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "from",
  "and",
  "or",
  "is",
  "are",
  "be",
  "it",
  "this",
  "that",
  "how",
  "do",
  "does",
  "can",
  "i",
  "me",
  "my",
  "you",
  "your",
  "want",
  "need",
  "please",
  "use",
  "using",
  "example",
  "examples",
  "snippet",
  "snippets",
  "code",
]);

/**
 * Falls back to all terms when every term is a stopword; a light plural
 * fold lets "devices" match "device".
 */
function normalizeQueryTokens(query: string): string[] {
  const raw = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
  const meaningful = raw.filter((token) => !QUERY_STOPWORDS.has(token));
  const kept = meaningful.length > 0 ? meaningful : raw;
  return [...new Set(kept.map((token) => (token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token)))];
}

/**
 * Title matches weigh heaviest, then tags, so examples named after the task
 * surface first. `matchedTokens` counts distinct query terms matched
 * anywhere: the coverage signal separating real matches from single-term
 * lexical noise.
 */
function scoreEntry(entry: SnippetIndexEntry, tokens: string[]): { score: number; matchedTokens: number } {
  const title = entry.title.toLowerCase();
  const description = entry.description.toLowerCase();
  const tags = entry.tags.map((tag) => tag.toLowerCase());
  const id = entry.id.toLowerCase();
  const filename = entry.filename.toLowerCase();

  let score = 0;
  let matchedTokens = 0;
  for (const token of tokens) {
    let matched = false;
    if (title.includes(token)) {
      score += 3;
      matched = true;
    }
    if (tags.some((tag) => tag.includes(token))) {
      score += 2;
      matched = true;
    }
    if (description.includes(token)) {
      score += 1;
      matched = true;
    }
    if (id.includes(token)) {
      score += 1;
      matched = true;
    }
    if (filename.includes(token)) {
      score += 1;
      matched = true;
    }
    if (matched) {
      matchedTokens += 1;
    }
  }

  return { score, matchedTokens };
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

/** Truncates to a UTF-8 byte budget on codepoint boundaries, marking the cut with an ellipsis. */
function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }
  const budget = maxBytes - Buffer.byteLength("…", "utf8");
  let truncated = "";
  let bytes = 0;
  for (const char of value) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (bytes + charBytes > budget) {
      break;
    }
    truncated += char;
    bytes += charBytes;
  }
  return `${truncated}…`;
}

async function searchCodeExamplesTool(_context: ServerContext, params: SearchCodeExamplesSchema): Promise<string> {
  return runSearchCodeExamples(params, SNIPPETS_FETCH_TIMEOUT_MS);
}

/** Deadline-injectable body: one operation signal covers every parallel index fetch. */
async function runSearchCodeExamples(params: SearchCodeExamplesSchema, timeoutMs: number): Promise<string> {
  const { query, type, runtime } = params;

  if (Buffer.byteLength(query, "utf8") > MAX_QUERY_BYTES) {
    throw invalidParamError("query", `must be at most ${MAX_QUERY_BYTES} bytes of UTF-8`, '{"query": "create a device", "type": "analysis"}');
  }
  if (type === "payload-parser" && runtime) {
    throw invalidParamError(
      "runtime",
      'only valid with type "analysis"; payload parsers are always JavaScript, so omit runtime',
      '{"query": "decode base64", "type": "payload-parser"}'
    );
  }

  const runtimes: string[] = type === "payload-parser" ? ["javascript"] : runtime ? [runtime] : [...SNIPPET_ANALYSIS_RUNTIMES];

  const operationSignal = AbortSignal.timeout(timeoutMs);

  const settled = await Promise.all(
    runtimes.map(async (indexRuntime) => {
      try {
        const entries =
          type === "payload-parser"
            ? await fetchSnippetIndex("payload-parser", undefined, operationSignal)
            : await fetchSnippetIndex("analysis", indexRuntime as SnippetAnalysisRuntime, operationSignal);
        return { runtime: indexRuntime, entries };
      } catch (error) {
        return { runtime: indexRuntime, error: (error as Error)?.message || String(error) };
      }
    })
  );

  const succeeded = settled.filter((result): result is { runtime: string; entries: SnippetIndexEntry[] } => "entries" in result);
  const failed = settled.filter((result): result is { runtime: string; error: string } => "error" in result);

  if (succeeded.length === 0) {
    // Report runtime names only, never the raw backend error text: it can carry
    // external redirect/Location content and is unbounded, which would bypass
    // the whole-response byte contract.
    throw new Error(
      `No snippets index could be fetched (affected: ${failed.map((failure) => failure.runtime).join(", ")}). The snippets catalog may be unreachable or misconfigured; retry later.`
    );
  }

  const failureNote = failed.length > 0 ? `\n\nNote: the ${failed.map((failure) => failure.runtime).join(", ")} index could not be fetched and was skipped.` : "";

  const tokens = normalizeQueryTokens(query);

  const scored: ScoredEntry[] = succeeded
    .flatMap(({ runtime: indexRuntime, entries }) => entries.map((entry) => ({ entry, runtime: indexRuntime, ...scoreEntry(entry, tokens) })))
    .filter(({ matchedTokens }) => matchedTokens > 0)
    .sort((a, b) => b.matchedTokens - a.matchedTokens || b.score - a.score || a.entry.filename.localeCompare(b.entry.filename) || a.runtime.localeCompare(b.runtime));

  // Coverage rule: an adequate match covers every meaningful query term.
  // With no adequate match, entries covering a strict majority of the terms
  // (at least two) are reported explicitly as partial; anything matching just
  // one term of a multi-term query is lexical noise, not a match.
  const fullMatches = scored.filter(({ matchedTokens }) => matchedTokens === tokens.length);
  const partialMatches = scored.filter(({ matchedTokens }) => matchedTokens < tokens.length && matchedTokens >= 2 && matchedTokens * 2 > tokens.length);

  const noInferenceNote =
    "Examples demonstrate only the exact operations in their code; do not infer adjacent API routes, endpoints, or behavior from an example that does not demonstrate them; confirm API behavior with search_docs.";

  if (fullMatches.length === 0 && partialMatches.length === 0) {
    const counts = succeeded.map(({ runtime: indexRuntime, entries }) => `${indexRuntime} (${entries.length})`).join(", ");
    return `No code example sufficiently matches "${query}": the catalog may not contain an example for this task, and entries matching only one of the terms were not treated as matches. Available examples per index searched: ${counts}. Try different terms, or use search_docs for platform/API documentation instead. ${noInferenceNote}${failureNote}`;
  }

  const showingPartial = fullMatches.length === 0;
  const ranked = (showingPartial ? partialMatches : fullMatches).slice(0, MAX_RESULTS);

  const header = "| Title | Description | Runtime | Filename |\n| --- | --- | --- | --- |";
  const rows = ranked.map(
    ({ entry, runtime: indexRuntime }) =>
      `| ${truncateUtf8(escapeTableCell(entry.title), MAX_TITLE_BYTES)} | ${truncateUtf8(escapeTableCell(entry.description), MAX_DESCRIPTION_BYTES)} | ${indexRuntime} | \`${truncateUtf8(entry.filename, MAX_FILENAME_BYTES)}\` |`
  );
  const steering =
    type === "payload-parser"
      ? 'Fetch a file with `get_code_example`, passing type "payload-parser" and the exact filename from the table (omit runtime).'
      : 'Fetch a file with `get_code_example`, passing type "analysis", the runtime shown in the table, and the exact filename.';

  // Any omission is stated so the caller refines the query instead of
  // assuming full coverage.
  const intro = showingPartial
    ? `No example matches every term of "${query}". Showing ${ranked.length} PARTIAL match(es): each matches only some of the terms and may not demonstrate the combined task; verify before relying on one.\n\n${header}\n`
    : `Found ${ranked.length} code example(s) for "${query}".\n\n${header}\n`;
  const tail = `\n\n${steering}\n\n${noInferenceNote}${failureNote}`;
  const omissionNote = (count: number) => `\n${count} matching example(s) were omitted to keep this response within ${MAX_RESPONSE_BYTES} bytes; refine the query to see them.`;
  let budget = MAX_RESPONSE_BYTES - Buffer.byteLength(intro + tail, "utf8") - Buffer.byteLength(omissionNote(rows.length), "utf8");
  const keptRows: string[] = [];
  for (const row of rows) {
    const rowBytes = Buffer.byteLength(`${row}\n`, "utf8");
    if (rowBytes > budget) {
      break;
    }
    keptRows.push(row);
    budget -= rowBytes;
  }
  const omitted = rows.length - keptRows.length;

  return `${intro}${keptRows.join("\n")}${omitted > 0 ? omissionNote(omitted) : ""}${tail}`;
}

const searchCodeExamplesConfigJSON: IToolConfig = {
  name: "search_code_examples",
  description: `Searches TagoIO's public code snippets catalog (snippets.tago.io) for working example scripts covering Analysis scripts and Payload Parsers. Use when developing a TagoIO Analysis (serverless compute function), writing a Payload Parser to decode device data, or looking up how a task is done in real example code. Results list matching examples (title, description, runtime, filename); pass the exact type/runtime/filename to get_code_example to read a file's full source. The catalog is public: no TagoIO credential is sent.

Set type to the kind of code you are writing. For type "analysis", optionally set runtime (node-legacy, python-legacy, node-rt2025, python-rt2025, or deno-rt2025) to restrict results; omit runtime to search all runtimes. runtime is not valid with type "payload-parser"; parsers are always JavaScript.

Do not use this tool for general programming questions unrelated to TagoIO or to retrieve live device data; for platform feature and configuration documentation, use search_docs instead. The catalog is small and may not contain an example for a given task: a "no sufficiently matching example" result means exactly that. Never infer API routes, endpoints, or behavior from an example that does not demonstrate them; confirm API behavior with search_docs.

<example>
{"query": "how to create a device", "type": "analysis"}
</example>`,
  parameters: searchCodeExamplesBaseSchema.shape,
  title: "Search TagoIO Code Examples",
  annotations: { readOnlyHint: true, openWorldHint: true },
  mutationClass: "read",
  tool: searchCodeExamplesTool,
};

export { MAX_RESPONSE_BYTES, runSearchCodeExamples, searchCodeExamplesBaseSchema, searchCodeExamplesConfigJSON };
