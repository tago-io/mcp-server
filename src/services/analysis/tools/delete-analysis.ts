import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";

const deleteAnalysisBaseSchema = z.object({
  analysis_id: resourceIdSchema("analysis ID"),
});

type DeleteAnalysisSchema = z.infer<typeof deleteAnalysisBaseSchema>;

async function deleteAnalysisTool(context: ServerContext, params: DeleteAnalysisSchema): Promise<string> {
  await context.resources.analysis.delete(params.analysis_id);
  return `Analysis \`${params.analysis_id}\` permanently deleted, including its script and version history.`;
}

const deleteAnalysisConfigJSON: IToolConfig = {
  name: "delete_analysis",
  description: `Permanently deletes a TagoIO analysis by ID. The analysis and its uploaded script are permanently removed and cannot be recovered.

Use this only when the user explicitly asks to remove an analysis. Confirm the target with get_analysis or search_analyses first if there is any ambiguity about which analysis is meant.

<example>
{ "analysis_id": "61f00000000000000000b001" }
</example>

Key limitations: deletion cannot be undone; the script and its version history are lost with the analysis; actions that reference the deleted analysis stop working.`,
  parameters: deleteAnalysisBaseSchema.shape,
  title: "Delete Analysis",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteAnalysisTool,
};

export { deleteAnalysisConfigJSON };
