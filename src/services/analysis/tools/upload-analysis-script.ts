import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { invalidParamError } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";

const MAX_SCRIPT_SOURCE_BYTES = 1024 * 1024;

const UPLOAD_EXAMPLE = '{ "analysis_id": "61f00000000000000000b001", "filename": "main.js", "source": "console.log(1)" }';

const uploadAnalysisScriptBaseSchema = z.object({
  analysis_id: resourceIdSchema("analysis ID"),
  filename: z.string().min(1).describe("Script file name, e.g. 'main.js' or 'report.py'."),
  source: z.string().describe("The script source as plain UTF-8 text, never base64. At most 1 MiB."),
});

type UploadAnalysisScriptSchema = z.infer<typeof uploadAnalysisScriptBaseSchema>;

async function uploadAnalysisScriptTool(context: ServerContext, params: UploadAnalysisScriptSchema): Promise<string> {
  const sourceBytes = Buffer.byteLength(params.source, "utf8");
  if (sourceBytes > MAX_SCRIPT_SOURCE_BYTES) {
    throw invalidParamError("source", `must be at most ${MAX_SCRIPT_SOURCE_BYTES} bytes of UTF-8 (received ${sourceBytes} bytes)`, UPLOAD_EXAMPLE);
  }

  // Prefetched only to read runtime/run_on; never rendered (AnalysisInfo carries secrets).
  const info = await context.resources.analysis.info(params.analysis_id);
  if (info.run_on === "external") {
    throw invalidParamError("analysis_id", "this analysis runs externally (run_on: external); only analyses hosted on TagoIO accept script uploads via this tool", UPLOAD_EXAMPLE);
  }
  if (!info.runtime || info.runtime === "other") {
    throw invalidParamError(
      "analysis_id",
      "this analysis has no supported runtime; only hosted TagoIO analyses with a known runtime (e.g. node-rt2025, python-rt2025) accept script uploads via this tool",
      UPLOAD_EXAMPLE
    );
  }

  const encodedSource = Buffer.from(params.source, "utf8").toString("base64");
  try {
    await context.resources.analysis.uploadScript(params.analysis_id, {
      name: params.filename,
      content: encodedSource,
      language: info.runtime,
    });
  } catch (error) {
    // A reflected failure can echo the submitted script (as the plaintext the
    // caller sent or the base64 form actually transmitted) alongside the
    // request credential; all three are known secrets here.
    throw new Error(describeErrorSafely(error, [context.token, params.source, encodedSource]));
  }

  return `Script \`${params.filename}\` uploaded to analysis \`${params.analysis_id}\` as a new version; it replaces the running script. Trigger it with run_analysis.`;
}

const uploadAnalysisScriptConfigJSON: IToolConfig = {
  name: "upload_analysis_script",
  description: `Uploads a script to a TagoIO analysis, replacing its running script with a new version.

Send the script source as plain UTF-8 text in \`source\`, never base64; the encoding for the API happens internally. The source must be at most 1 MiB. The analysis must be hosted on TagoIO with a known runtime (external analyses and runtime "other" are rejected); the upload language is derived from the analysis's runtime automatically. The uploaded source may not be echoed back in the result.

Write the source for the analysis's runtime; a mismatch uploads cleanly and then fails at import, and that failure is not reported here.

- \`deno-rt2025\` — TypeScript. \`import { Analysis } from "npm:@tago-io/sdk";\`, end with \`Analysis.use(handler)\`; the handler receives \`(context, scope)\`. Any \`npm:\` or \`https:\` import resolves automatically.
- \`python-rt2025\` — \`from tagoio_sdk import Analysis\`, end with \`Analysis.use(handler)\`; declare extra packages in a \`# /// script\` dependencies block.
- \`node-rt2025\` — nothing is installed at run time, so only a pre-bundled single file works. Without a bundle, use no imports at all: read \`process.env.T_ANALYSIS_TOKEN\`, \`T_ANALYSIS_ENV\` and \`T_ANALYSIS_DATA\` (the last two are JSON strings) and call the TagoIO API with \`fetch\`.
- \`node-legacy\` — \`require("@tago-io/sdk")\` plus \`Analysis.use(handler)\`. Deprecated.

Name the file for the runtime (\`.ts\` deno, \`.js\` node, \`.py\` python). For a working template, call \`search_code_examples\` with the target runtime.

<example>
${UPLOAD_EXAMPLE}
</example>

Key limitations: each upload creates a new version and immediately replaces the running script; 1 MiB source cap; use run_analysis afterwards to execute it.`,
  parameters: uploadAnalysisScriptBaseSchema.shape,
  title: "Upload Analysis Script",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: uploadAnalysisScriptTool,
};

export { MAX_SCRIPT_SOURCE_BYTES, uploadAnalysisScriptConfigJSON };
