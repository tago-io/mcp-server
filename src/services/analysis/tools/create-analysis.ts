import { z } from "zod/v3";

import { tagsObjectModel } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { IToolConfig, ServerContext } from "../../types";
import { ANALYSIS_CREATE_RUNTIMES, DEFAULT_ANALYSIS_RUNTIME } from "../runtime-policy";
import { buildAnalysisCreateBody, environmentValueSecrets, environmentVariablesIssue, environmentVariablesSchema } from "../sdk-boundary";

const createAnalysisBaseSchema = z.object({
  name: z.string().min(1).describe("The name for the analysis."),
  description: z.string().describe("The description for the analysis.").optional(),
  runtime: z
    .enum(ANALYSIS_CREATE_RUNTIMES)
    .describe(
      "Runtime for the new analysis; it cannot be changed later. Defaults to `deno-rt2025`, which resolves imports automatically. Choose `node-rt2025` only if you will upload an already-bundled single file: it installs nothing at run time, so any bare import fails."
    )
    .optional(),
  interval: z.string().describe("Schedule interval for automatic runs, e.g. '5 minutes' or '1 hour'. Omit for trigger-only analyses.").optional(),
  active: z.boolean().describe("Whether the analysis starts enabled. Defaults to true.").optional(),
  environment_variables: environmentVariablesSchema.optional(),
  tags: z.array(tagsObjectModel).describe("The tags for the analysis. E.g: [{ key: 'analysis_type', value: 'invoice' }]").optional(),
});

type CreateAnalysisSchema = z.infer<typeof createAnalysisBaseSchema>;

const createAnalysisCrossField = z.any().superRefine((value, ctx) => {
  const issue = environmentVariablesIssue((value as { environment_variables?: { key: string; value: string | number | boolean }[] })?.environment_variables);
  if (issue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
  }
});

async function createAnalysisTool(context: ServerContext, params: CreateAnalysisSchema): Promise<string> {
  const body = buildAnalysisCreateBody(params);

  let createdToken: string | undefined;
  try {
    const result = await context.resources.analysis.create(body);
    createdToken = result.token;
    return `Analysis created with ID \`${result.id}\`. Upload its script with upload_analysis_script to make it runnable.`;
  } catch (error) {
    // The create response mints an analysis token the SDK may echo in failure
    // detail before the handler ever learns it, so beyond the known secrets
    // (request credential, minted token, submitted environment values),
    // analysis-token-shaped values ("a-" prefixed) are pattern-redacted too.
    const safe = describeErrorSafely(error, [context.token, createdToken, ...environmentValueSecrets(params.environment_variables)]).replace(
      /\ba-[A-Za-z0-9][A-Za-z0-9-]{18,}/g,
      "[redacted-token]"
    );
    throw new Error(safe);
  }
}

const createAnalysisConfigJSON: IToolConfig = {
  name: "create_analysis",
  description: `Creates a new analysis (serverless script) in the TagoIO profile, hosted on TagoIO.

Use this when the user wants a new analysis to run custom logic: data processing, integrations, or scheduled jobs. The analysis is created without a script; upload one afterwards with upload_analysis_script to make it runnable. Pick the runtime before writing any code: it decides the module system and the entry point. \`deno-rt2025\` (default, TypeScript) and \`python-rt2025\` resolve dependencies automatically; \`node-rt2025\` runs only a pre-bundled single file; the legacy runtimes are deprecated and not offered for new analyses. Runtimes for new analyses are ${ANALYSIS_CREATE_RUNTIMES.join(", ")} (default ${DEFAULT_ANALYSIS_RUNTIME}). Environment variable values are sensitive and are never echoed back.

<example>
{
  "name": "Fleet Report",
  "runtime": "deno-rt2025",
  "interval": "1 hour",
  "environment_variables": [{ "key": "REPORT_EMAIL", "value": "ops@example.com" }],
  "tags": [{ "key": "analysis_type", "value": "report" }]
}
</example>

Key limitations: the new analysis has no script until one is uploaded; environment variables accept at most 20 entries with unique keys; the runtime cannot be changed after creation.`,
  parameters: createAnalysisBaseSchema.shape,
  title: "Create Analysis",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: createAnalysisCrossField,
  tool: createAnalysisTool,
};

export { createAnalysisConfigJSON };
