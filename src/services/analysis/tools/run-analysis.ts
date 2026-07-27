import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { IToolConfig, ServerContext } from "../../types";

const runAnalysisBaseSchema = z.object({
  analysis_id: resourceIdSchema("analysis ID"),
  scope: z.record(z.string(), z.unknown()).describe("Optional JSON object handed to the analysis as its scope.").optional(),
});

type RunAnalysisSchema = z.infer<typeof runAnalysisBaseSchema>;

async function runAnalysisTool(context: ServerContext, params: RunAnalysisSchema): Promise<string> {
  try {
    // The response mints an analysis_token that must never reach results.
    await context.resources.analysis.run(params.analysis_id, params.scope);
  } catch (error) {
    // The failure detail may embed the minted token before the handler ever
    // learns it, so analysis-token-shaped values are pattern-redacted too.
    const safe = describeErrorSafely(error, [context.token]).replace(/\ba-[A-Za-z0-9][A-Za-z0-9-]{18,}/g, "[redacted-token]");
    throw new Error(safe);
  }

  return `Run of analysis \`${params.analysis_id}\` was triggered. Execution is asynchronous; the run has NOT finished yet. Check its output with read_analysis_console; console output can take time to appear.`;
}

const runAnalysisConfigJSON: IToolConfig = {
  name: "run_analysis",
  description: `Triggers a run of a TagoIO analysis, optionally passing a JSON scope object to the script.

Use when the user wants to execute an analysis now. The trigger is asynchronous: a success result only acknowledges that the run started, not that it finished. Read the run's output afterwards with read_analysis_console (output can take time to appear).

<example>
{ "analysis_id": "61f00000000000000000b001", "scope": { "device": "61f0000000000000000d0001" } }
</example>

Key limitations: no completion status or return value is available from this tool; the analysis must be active and have an uploaded script to produce output.`,
  parameters: runAnalysisBaseSchema.shape,
  title: "Run Analysis",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: runAnalysisTool,
};

export { runAnalysisConfigJSON };
