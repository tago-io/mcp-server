import type { AnalysisCreateInfo, AnalysisInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { pickDefined } from "../../utils/pick-defined";
import { invalidParamMessage } from "../../utils/tool-errors";
import { AnalysisCreateRuntime, DEFAULT_ANALYSIS_RUNTIME } from "./runtime-policy";

/**
 * Boundary adapter for the pinned SDK's defective AnalysisCreateInfo
 * declaration (`active?: true`; `variables` typed as a single object instead
 * of an array). The wire bodies are built here and cast once; this is the
 * only module allowed to cast at the analysis SDK boundary.
 */

const MAX_ENVIRONMENT_VARIABLES = 20;

const ENVIRONMENT_VARIABLES_EXAMPLE = '[{ "key": "API_URL", "value": "https://api.example.com" }]';

const environmentVariablesSchema = z
  .array(
    z.object({
      key: z.string().min(1).describe("Environment variable name."),
      value: z.union([z.string(), z.number(), z.boolean()]).describe("Environment variable value. Sensitive; never echoed back in results."),
    })
  )
  .max(MAX_ENVIRONMENT_VARIABLES)
  .describe(
    `Environment variables available to the script (max ${MAX_ENVIRONMENT_VARIABLES}, unique keys). Values are sensitive and never echoed back. Replaces the current set entirely when updating.`
  );

type EnvironmentVariableInput = z.infer<typeof environmentVariablesSchema>[number];

interface AnalysisCreateParams {
  name: string;
  description?: string;
  runtime?: AnalysisCreateRuntime;
  interval?: string;
  active?: boolean;
  environment_variables?: EnvironmentVariableInput[];
  tags?: Array<{ key: string; value: string }>;
}

interface AnalysisEditParams {
  name?: string;
  description?: string;
  active?: boolean;
  interval?: string;
  environment_variables?: EnvironmentVariableInput[];
  tags?: Array<{ key: string; value: string }>;
}

/**
 * Cross-field env-var check: at-most-20 and unique keys. Returns the actionable
 * message on violation or null when valid, so a tool's crossFieldSchema can turn
 * it into a zod issue. (The array schema also carries `.max` for advertisement.)
 */
function environmentVariablesIssue(variables: EnvironmentVariableInput[] | undefined): string | null {
  if (!variables) {
    return null;
  }
  if (variables.length > MAX_ENVIRONMENT_VARIABLES) {
    return invalidParamMessage("environment_variables", `must contain at most ${MAX_ENVIRONMENT_VARIABLES} entries`, ENVIRONMENT_VARIABLES_EXAMPLE);
  }
  const seen = new Set<string>();
  for (const variable of variables) {
    if (seen.has(variable.key)) {
      return invalidParamMessage("environment_variables", `keys must be unique: "${variable.key}" appears more than once`, ENVIRONMENT_VARIABLES_EXAMPLE);
    }
    seen.add(variable.key);
  }
  return null;
}

/**
 * Environment variable values as the exact strings a reflected SDK error could
 * carry (numbers and booleans reflect in their string form). Every value is
 * sensitive input, so mutation failures redact all of them.
 */
function environmentValueSecrets(variables: EnvironmentVariableInput[] | undefined): string[] {
  return (variables ?? []).map((variable) => String(variable.value));
}

function buildAnalysisCreateBody(params: AnalysisCreateParams): AnalysisCreateInfo {
  const body: Record<string, unknown> = {
    name: params.name,
    runtime: params.runtime ?? DEFAULT_ANALYSIS_RUNTIME,
    run_on: "tago",
    ...pickDefined({
      description: params.description,
      interval: params.interval,
      active: params.active,
      variables: params.environment_variables,
      tags: params.tags,
    }),
  };
  return body as unknown as AnalysisCreateInfo;
}

/** Builds the edit body from an explicit field list; `runtime` and `run_on` cannot transit. */
function buildAnalysisEditBody(params: AnalysisEditParams): Partial<AnalysisInfo> {
  const body: Record<string, unknown> = pickDefined({
    name: params.name,
    description: params.description,
    active: params.active,
    interval: params.interval,
    variables: params.environment_variables,
    tags: params.tags,
  });
  return body as Partial<AnalysisInfo>;
}

export { buildAnalysisCreateBody, buildAnalysisEditBody, environmentValueSecrets, environmentVariablesIssue, environmentVariablesSchema, MAX_ENVIRONMENT_VARIABLES };
export type { EnvironmentVariableInput };
