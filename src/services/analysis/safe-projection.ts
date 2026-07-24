import { redactSecrets } from "../../utils/safe-error";
import { stripTokenFields } from "../../utils/strip-token-fields";

/**
 * Env values shorter than this are NOT literal-redacted from console text.
 * A real secret is long; splitting on a value like "5", "true", or "prod"
 * would mangle unrelated console output everywhere those substrings appear.
 * A short benign env value that slips through is an accepted, documented
 * limitation, not a leak worth corrupting output to close.
 */
const MIN_REDACTABLE_ENV_VALUE_LENGTH = 8;

// Analysis/run tokens the script may have printed itself (`a-` prefixed). No
// leading `\b`: an `a-` token can be adjacent to a word char (e.g. logged as
// `token_a-...`), where a word boundary would not match and let it survive.
const ANALYSIS_TOKEN_PATTERN = /a-[A-Za-z0-9][A-Za-z0-9-]{18,}/g;

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
 * `console` from a full AnalysisInfo payload and never renders token or
 * environment-variable fields directly, giving read_analysis_console a
 * string-only boundary. A script can still print its OWN secrets (its analysis
 * token, env-var values), and the request-credential boundary in buildServer
 * only knows the request token, so this projection scrubs the analysis's known
 * secrets from each entry: the analysis token (`info.token`), any long env-var
 * value, and any `a-` token-shaped substring the script emitted.
 */
function projectAnalysisConsole(info: { console?: unknown; token?: unknown; variables?: unknown }): string[] {
  const consoleEntries = info.console;
  if (!Array.isArray(consoleEntries)) {
    return [];
  }

  const literalSecrets: string[] = [];
  if (typeof info.token === "string" && info.token.length > 0) {
    literalSecrets.push(info.token);
  }
  if (Array.isArray(info.variables)) {
    for (const variable of info.variables) {
      const value = (variable as { value?: unknown }).value;
      // Env values are string | number | boolean (sdk-boundary), and a script
      // can log the number/boolean form, so redact the String() form under the
      // same length threshold (short forms like "8080"/"true" stay intact).
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        const asString = String(value);
        if (asString.length >= MIN_REDACTABLE_ENV_VALUE_LENGTH) {
          literalSecrets.push(asString);
        }
      }
    }
  }

  // Redaction cannot follow a secret split across separate console entries;
  // that residual is an accepted limitation of per-entry scrubbing.
  return consoleEntries.map((entry) => redactSecrets(String(entry), literalSecrets).replace(ANALYSIS_TOKEN_PATTERN, "[redacted-token]"));
}

export { PROJECTED_ANALYSIS_FIELDS, projectAnalysis, projectAnalysisConsole };
