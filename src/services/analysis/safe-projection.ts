import { stripTokenFields } from "../../utils/strip-token-fields";

/**
 * Allowlisted projection every general Analysis API response must pass through
 * before rendering. AnalysisInfo carries secrets (`token`, environment
 * variable values) and console output that must never reach general tool
 * results, even in detailed mode, so raw payloads never go to
 * renderItem/renderList.
 */

const PROJECTED_ANALYSIS_FIELDS = [
  "id",
  "name",
  "active",
  "runtime",
  "run_on",
  "interval",
  "last_run",
  "created_at",
  "updated_at",
  "tags",
  "description",
  "file_name",
  "version",
  "versions",
] as const;

function projectAnalysis(info: Record<string, unknown>): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const field of PROJECTED_ANALYSIS_FIELDS) {
    if (field in info) {
      // Allowed fields can still carry nested structures (e.g. `versions`) with
      // token/analysis_token properties inside; strip them at any depth.
      projected[field] = stripTokenFields(info[field]);
    }
  }
  if ("variables" in info) {
    const variables = info.variables;
    projected.environment_variable_keys = Array.isArray(variables)
      ? variables.map((variable) => (variable as { key?: unknown }).key).filter((key): key is string => typeof key === "string")
      : [];
  }
  return projected;
}

/**
 * The sole console-exposing exemption to the general safe projection. It reads
 * only `console` from a full AnalysisInfo payload, never token or environment
 * variable fields, and gives read_analysis_console a string-only boundary.
 */
function projectAnalysisConsole(info: { console?: unknown }): string[] {
  const consoleEntries = info.console;
  return Array.isArray(consoleEntries) ? consoleEntries.map((entry) => String(entry)) : [];
}

export { PROJECTED_ANALYSIS_FIELDS, projectAnalysis, projectAnalysisConsole };
