import { z } from "zod/v3";

import { resourceIdSchema, tagsObjectModel } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { invalidParamMessage } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { buildAnalysisEditBody, environmentValueSecrets, environmentVariablesIssue, environmentVariablesSchema } from "../sdk-boundary";

const updateAnalysisBaseSchema = z.object({
  analysis_id: resourceIdSchema("analysis ID"),
  name: z.string().min(1).describe("The new name for the analysis.").optional(),
  description: z.string().describe("The new description for the analysis.").optional(),
  active: z.boolean().describe("Enable or disable the analysis.").optional(),
  interval: z.string().describe("The new schedule interval, e.g. '5 minutes' or '1 hour'.").optional(),
  environment_variables: environmentVariablesSchema.optional(),
  tags: z.array(tagsObjectModel).describe("The new tags for the analysis, replacing the current ones.").optional(),
});

type UpdateAnalysisSchema = z.infer<typeof updateAnalysisBaseSchema>;

const UPDATE_EDITABLE_KEYS = ["name", "description", "active", "interval", "environment_variables", "tags"] as const;

const updateAnalysisCrossField = z.any().superRefine((value, ctx) => {
  const obj = (value ?? {}) as { environment_variables?: { key: string; value: string | number | boolean }[] };
  if (!UPDATE_EDITABLE_KEYS.some((key) => (obj as Record<string, unknown>)[key] !== undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: invalidParamMessage(
        "analysis_id",
        "at least one field to update must be provided alongside it",
        '{ "analysis_id": "61f00000000000000000b001", "name": "New name" }'
      ),
    });
    return;
  }
  const issue = environmentVariablesIssue(obj.environment_variables);
  if (issue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
  }
});

async function updateAnalysisTool(context: ServerContext, params: UpdateAnalysisSchema): Promise<string> {
  const changes = buildAnalysisEditBody(params);

  try {
    await context.resources.analysis.edit(params.analysis_id, changes);
  } catch (error) {
    // A reflected failure can echo submitted environment values (and the
    // request credential, which the composition root also redacts).
    throw new Error(describeErrorSafely(error, [context.token, ...environmentValueSecrets(params.environment_variables)]));
  }
  // Controlled local confirmation: the SDK success text is server-provided
  // and may echo submitted values, so it never reaches the result.
  return `Analysis \`${params.analysis_id}\` updated.`;
}

const updateAnalysisConfigJSON: IToolConfig = {
  name: "update_analysis",
  description: `Updates an existing TagoIO analysis by ID. Only the provided fields are changed; \`environment_variables\` and \`tags\` replace the current sets entirely when provided.

Use this when the user wants to rename, retag, enable/disable, reschedule, or change the environment variables of an existing analysis. Look up the analysis with search_analyses or get_analysis first if you only have its name. The runtime and run location cannot be changed. Environment variable values are sensitive and are never echoed back.

<example>
{
  "analysis_id": "61f00000000000000000b001",
  "active": false,
  "description": "Paused while the data source is migrated"
}
</example>

Key limitations: at least one editable field must be provided; \`environment_variables\` is not merged with the existing set; send the complete new list (max 20 entries, unique keys); the script itself is changed with upload_analysis_script, not here.`,
  parameters: updateAnalysisBaseSchema.shape,
  title: "Update Analysis",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: updateAnalysisCrossField,
  tool: updateAnalysisTool,
};

export { updateAnalysisConfigJSON };
