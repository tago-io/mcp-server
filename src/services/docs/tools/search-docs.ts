import { z } from "zod/v3";

import { IToolConfig, ServerContext } from "../../types";
import { DocsIndexEntry, fetchDocsIndex } from "../docs-index";

const DEFAULT_LIMIT = 10;

const searchDocsBaseSchema = z.object({
  query: z.string().min(2).describe('Search terms to match against page titles, descriptions, and paths, e.g. "device token" or "payload parser".'),
  limit: z.number().min(1).max(25).optional().describe("Maximum number of results to return. Defaults to 10."),
});

type SearchDocsSchema = z.infer<typeof searchDocsBaseSchema>;

/** Title matches weigh double so exact feature names surface first. */
function scoreEntry(entry: DocsIndexEntry, tokens: string[]): number {
  const title = entry.title.toLowerCase();
  const description = entry.description.toLowerCase();
  const path = entry.path.toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) {
      score += 2;
    }
    if (description.includes(token)) {
      score += 1;
    }
    if (path.includes(token)) {
      score += 1;
    }
  }

  return score;
}

async function searchDocsTool(_context: ServerContext, params: SearchDocsSchema): Promise<string> {
  const { query, limit } = params;
  const maxResults = limit ?? DEFAULT_LIMIT;

  const entries = await fetchDocsIndex();
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  const ranked = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  if (ranked.length === 0) {
    return `No documentation pages matched "${query}". Try broader or different terms (e.g. "devices", "analysis", "dashboard"), or call \`platform_overview\` for a concept map of the platform.`;
  }

  const lines = ranked.map(({ entry }) => `- **${entry.title}**: \`${entry.path}\`\n  ${entry.description}`);
  return `Found ${ranked.length} documentation page(s) for "${query}". Pass a path to \`read_doc\` to read the full page.\n\n${lines.join("\n")}`;
}

const searchDocsConfigJSON: IToolConfig = {
  name: "search_docs",
  description: `Searches the official TagoIO documentation index (docs.tago.io) and returns the best-matching pages: title, path, and a one-line description. Pass one of the returned paths to the read_doc tool to read the full page.

Use this to ground answers about TagoIO features, limits, and configuration in the official docs instead of guessing. Matching is case-insensitive keyword search over page titles, descriptions, and paths, so prefer concrete feature terms ("payload parser", "blueprint dashboard", "data retention") over full questions. If nothing relevant comes back, retry with broader terms or call platform_overview for a concept map of the platform.

<example>
{"query": "device token", "limit": 5}
</example>`,
  parameters: searchDocsBaseSchema.shape,
  title: "Search TagoIO Docs",
  annotations: { readOnlyHint: true, openWorldHint: true },
  mutationClass: "read",
  tool: searchDocsTool,
};

export { searchDocsConfigJSON };
