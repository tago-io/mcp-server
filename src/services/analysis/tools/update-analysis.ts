import { z } from "zod/v3";

import { resourceIdSchema, tagsObjectModel } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { invalidParamError, invalidParamMessage } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { buildAnalysisEditBody, ENDPOINT_RUNTIME, endpointSchema, environmentValueSecrets, environmentVariablesIssue, environmentVariablesSchema } from "../sdk-boundary";

const updateAnalysisBaseSchema = z.object({
  analysis_id: resourceIdSchema("analysis ID"),
  name: z.string().min(1).describe("The new name for the analysis.").optional(),
  description: z.string().describe("The new description for the analysis.").optional(),
  active: z.boolean().describe("Enable or disable the analysis.").optional(),
  interval: z.string().describe("The new schedule interval, e.g. '5 minutes' or '1 hour'.").optional(),
  environment_variables: environmentVariablesSchema.optional(),
  tags: z.array(tagsObjectModel).describe("The new tags for the analysis, replacing the current ones.").optional(),
  endpoint: endpointSchema.optional(),
});

type UpdateAnalysisSchema = z.infer<typeof updateAnalysisBaseSchema>;

const UPDATE_EDITABLE_KEYS = ["name", "description", "active", "interval", "environment_variables", "tags", "endpoint"] as const;

const ENDPOINT_EXAMPLE = '{ "analysis_id": "61f00000000000000000b001", "endpoint": { "active": true, "access": "token" } }';

const updateAnalysisCrossField = z.any().superRefine((value, ctx) => {
  const obj = (value ?? {}) as { environment_variables?: { key: string; value: string | number | boolean }[]; endpoint?: Record<string, unknown> };
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
  if (obj.endpoint && Object.keys(obj.endpoint).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: invalidParamMessage("endpoint", "must set `active`, `access`, or both", ENDPOINT_EXAMPLE) });
    return;
  }
  const issue = environmentVariablesIssue(obj.environment_variables);
  if (issue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
  }
});

interface StoredEndpointState {
  endpoint: { active?: boolean; access?: string };
  analysisActive?: boolean;
}

/** The Endpoint exists only on Luau; read the stored state so the result can show the resulting mode. */
async function storedEndpointState(context: ServerContext, analysisID: string): Promise<StoredEndpointState> {
  // Prefetched only to read runtime, active, and endpoint; never rendered (AnalysisInfo carries secrets).
  const info = (await context.resources.analysis.info(analysisID)) as unknown as {
    runtime?: string;
    active?: boolean;
    endpoint?: { active?: boolean; access?: string };
  };
  if (info.runtime !== ENDPOINT_RUNTIME) {
    throw invalidParamError("endpoint", `only ${ENDPOINT_RUNTIME} analyses can serve an Endpoint; this analysis runs ${info.runtime ?? "an unknown runtime"}`, ENDPOINT_EXAMPLE);
  }
  return { endpoint: info.endpoint ?? {}, analysisActive: info.active };
}

interface EndpointSummaryInput {
  url: string;
  endpoint: { active?: boolean; access?: string };
  analysisActive?: boolean;
}

function endpointSummary({ url, endpoint, analysisActive }: EndpointSummaryInput): string {
  if (!endpoint.active) {
    return `Endpoint is off. When on, it is served at ${url}`;
  }
  const access = endpoint.access ?? "token";
  const lines = [
    `Endpoint is on (${access} access) at ${url}; append a path such as \`orders\` to reach \`context.request.path\` "/orders".`,
    "A TagoRUN user or analysis calling it with its own token also needs an Access Management grant: resource `analysis`, action `call_endpoint`, matching this analysis (create_run_user_access_policy or create_analysis_access_policy).",
  ];
  // The platform answers every call to an inactive analysis's Endpoint with 404.
  if (analysisActive === false) {
    lines.push("The analysis itself is inactive, so the Endpoint answers 404 until the analysis is activated (`active: true`).");
  }
  return lines.join("\n");
}

async function updateAnalysisTool(context: ServerContext, params: UpdateAnalysisSchema): Promise<string> {
  const changes = buildAnalysisEditBody(params);
  const stored = params.endpoint ? await storedEndpointState(context, params.analysis_id) : undefined;

  try {
    await context.resources.analysis.edit(params.analysis_id, changes);
  } catch (error) {
    // A reflected failure can echo submitted environment values (and the
    // request credential, which the composition root also redacts).
    throw new Error(describeErrorSafely(error, [context.token, ...environmentValueSecrets(params.environment_variables)]));
  }
  // Controlled local confirmation: the SDK success text is server-provided
  // and may echo submitted values, so it never reaches the result.
  const confirmation = `Analysis \`${params.analysis_id}\` updated.`;
  if (!stored || !params.endpoint) {
    return confirmation;
  }
  const url = `${context.region.api.replace(/\/$/, "")}/endpoint/${params.analysis_id}/`;
  const summary = endpointSummary({ url, endpoint: { ...stored.endpoint, ...params.endpoint }, analysisActive: params.active ?? stored.analysisActive });
  return `${confirmation}\n${summary}`;
}

const updateAnalysisConfigJSON: IToolConfig = {
  name: "update_analysis",
  description: `Updates an existing TagoIO analysis by ID. Only the provided fields are changed; \`environment_variables\` and \`tags\` replace the current sets entirely when provided.

Use this when the user wants to rename, retag, enable/disable, reschedule, or change the environment variables of an existing analysis. Look up the analysis with search_analyses or get_analysis first if you only have its name. The runtime and run location cannot be changed. Environment variable values are sensitive and are never echoed back.

\`endpoint\` turns a ${ENDPOINT_RUNTIME} analysis into an HTTP Endpoint at {API URL}/endpoint/{analysis_id}/. Upload a script that returns a response for \`context.request\` first (see upload_analysis_script). In either access mode, a run user or analysis token used to call it needs the Access Management grant \`analysis\` / \`call_endpoint\` (without it the call returns 404, even when public); "public" only means a caller may also send no token at all. The result shows the Endpoint URL.

<example>
{
  "analysis_id": "61f00000000000000000b001",
  "active": false,
  "description": "Paused while the data source is migrated"
}
</example>

<example>
${ENDPOINT_EXAMPLE}
</example>

Key limitations: at least one editable field must be provided; \`endpoint\` is accepted only on ${ENDPOINT_RUNTIME} analyses; \`environment_variables\` is not merged with the existing set; send the complete new list (max 20 entries, unique keys); the script itself is changed with upload_analysis_script, not here.`,
  parameters: updateAnalysisBaseSchema.shape,
  title: "Update Analysis",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: updateAnalysisCrossField,
  tool: updateAnalysisTool,
};

export { updateAnalysisConfigJSON };
