import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";
import { projectAnalysis } from "../safe-projection";

const getAnalysisSchema = {
  analysis_id: resourceIdSchema("analysis ID"),
  response_format: responseFormatSchema,
};

type GetAnalysisParams = z.infer<z.ZodObject<typeof getAnalysisSchema>>;

async function getAnalysisTool(context: ServerContext, params: GetAnalysisParams): Promise<string> {
  const analysis = projectAnalysis((await context.resources.analysis.info(params.analysis_id)) as unknown as Record<string, unknown>);
  return renderItem(analysis, ["id", "name", "runtime", "active", "run_on", "last_run", "interval", "tags", "created_at", "updated_at"], params.response_format);
}

const getAnalysisConfigJSON: IToolConfig = {
  name: "get_analysis",
  description: `Fetches one analysis (serverless script) by ID with its configuration and settings.

Use when you already know the analysis ID (from search_analyses) and need its details, such as runtime, schedule interval, environment variables, or tags. Not for running analyses or reading their script source.

<example>
{"analysis_id": "61f0000000000000000a0001"}
</example>`,
  parameters: getAnalysisSchema,
  title: "Get Analysis",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getAnalysisTool,
};

export { getAnalysisConfigJSON };
