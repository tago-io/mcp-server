import { z } from "zod/v3";

import { invalidParamError } from "../../../utils/tool-errors";
import { fenceUserContent } from "../../analysis/user-content";
import { IToolConfig, ServerContext } from "../../types";
import { fetchSnippetIndex, fetchSnippetSource, SNIPPET_ANALYSIS_RUNTIMES, SNIPPETS_FETCH_TIMEOUT_MS } from "../snippets-backend";

const getCodeExampleBaseSchema = z.object({
  type: z.enum(["analysis", "payload-parser"]).describe("The catalog the example belongs to, as returned by search_code_examples."),
  runtime: z
    .enum(SNIPPET_ANALYSIS_RUNTIMES)
    .optional()
    .describe('The Analysis runtime the example belongs to, from the search_code_examples result. Required for type "analysis"; omit for "payload-parser".'),
  filename: z.string().min(1).describe('The exact filename from a search_code_examples result row, e.g. "console.js".'),
});

type GetCodeExampleSchema = z.infer<typeof getCodeExampleBaseSchema>;

async function getCodeExampleTool(_context: ServerContext, params: GetCodeExampleSchema): Promise<string> {
  return runGetCodeExample(params, SNIPPETS_FETCH_TIMEOUT_MS);
}

/** Deadline-injectable body: one operation signal covers the index AND source fetches. */
async function runGetCodeExample(params: GetCodeExampleSchema, timeoutMs: number): Promise<string> {
  const { type, runtime, filename } = params;

  if (type === "analysis" && !runtime) {
    throw invalidParamError(
      "runtime",
      'required with type "analysis"; pass the runtime shown by search_code_examples',
      '{"type": "analysis", "runtime": "node-rt2025", "filename": "console.js"}'
    );
  }
  if (type === "payload-parser" && runtime) {
    throw invalidParamError(
      "runtime",
      'only valid with type "analysis"; payload parsers are always JavaScript, so omit runtime',
      '{"type": "payload-parser", "filename": "base64-decoder.js"}'
    );
  }

  const operationSignal = AbortSignal.timeout(timeoutMs);

  const entries = type === "analysis" ? await fetchSnippetIndex("analysis", runtime, operationSignal) : await fetchSnippetIndex("payload-parser", undefined, operationSignal);
  const entry = entries.find((candidate) => candidate.filename === filename);
  if (!entry) {
    const where = type === "analysis" ? `the ${runtime} analysis` : "the payload-parser";
    throw new Error(`"${filename}" is not in ${where} snippets index. Run search_code_examples to get current filenames (they must match exactly).`);
  }

  // The fetch uses the index's own file_path, never a caller-assembled path;
  // fetchSnippetSource additionally rejects traversal-shaped index entries.
  const source = await fetchSnippetSource(type, entry.file_path, operationSignal);

  const runtimeLabel = type === "analysis" ? runtime : "javascript";
  return `Code example "${entry.title}" (\`${entry.filename}\`, runtime ${runtimeLabel}) from TagoIO's public snippets catalog (snippets.tago.io). This is example code, not account data:\n\n${fenceUserContent(source)}`;
}

const getCodeExampleConfigJSON: IToolConfig = {
  name: "get_code_example",
  description: `Fetches the full source of one example file from TagoIO's public code snippets catalog (snippets.tago.io). Call search_code_examples first, then pass the exact type, runtime, and filename from a result row. runtime is required when type is "analysis" and must be omitted for "payload-parser" (parsers are always JavaScript). The returned content is public example code fenced as an inert block; no TagoIO credential is sent.

<example>
{"type": "analysis", "runtime": "node-rt2025", "filename": "console.js"}
</example>`,
  parameters: getCodeExampleBaseSchema.shape,
  title: "Get TagoIO Code Example",
  annotations: { readOnlyHint: true, openWorldHint: true },
  mutationClass: "read",
  tool: getCodeExampleTool,
};

export { getCodeExampleBaseSchema, getCodeExampleConfigJSON, runGetCodeExample };
