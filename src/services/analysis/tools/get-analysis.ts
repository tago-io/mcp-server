import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";
import { projectAnalysis } from "../safe-projection";
import { ENDPOINT_RUNTIME } from "../sdk-boundary";

const getAnalysisSchema = {
  analysis_id: resourceIdSchema("analysis ID"),
  response_format: responseFormatSchema,
};

type GetAnalysisParams = z.infer<z.ZodObject<typeof getAnalysisSchema>>;

const CONCISE_FIELDS = ["id", "name", "runtime", "active", "run_on", "last_run", "interval", "tags", "created_at", "updated_at"];

async function getAnalysisTool(context: ServerContext, params: GetAnalysisParams): Promise<string> {
  const analysis = projectAnalysis((await context.resources.analysis.info(params.analysis_id)) as unknown as Record<string, unknown>);
  // Only Luau analyses can serve an Endpoint, so only they show it in the concise view.
  const fields = analysis.runtime === ENDPOINT_RUNTIME ? [...CONCISE_FIELDS, "endpoint"] : CONCISE_FIELDS;
  return renderItem(analysis, fields, params.response_format);
}

const getAnalysisConfigJSON: IToolConfig = {
  name: "get_analysis",
  description: `Fetches one analysis (serverless script) by ID with its configuration and settings.

Use when you already know the analysis ID (from search_analyses) and need its details, such as runtime, schedule interval, environment variables, tags, or, for a luau-rt2026 analysis, whether its HTTP Endpoint is on (\`endpoint.active\`) and its access mode. Not for running analyses or reading their script source.

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
