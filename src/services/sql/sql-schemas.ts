import { z } from "zod/v3";

import { tagsObjectModel } from "../../utils/global-params.model";
import { invalidParamMessage } from "../../utils/tool-errors";

// The API silently clamps a longer TTL to this, so a larger value is refused
// locally instead of being stored as something else.
const MAX_CACHE_TTL_SECONDS = 86_400;

const PARAM_KEY_PATTERN = /^\$[1-9]\d*$/;

const PARAMS_EXAMPLE = '[{ "key": "$1", "value": "30" }]';

/** The fields a saved query stores; an edit must resend all of them (the API replaces the whole query). */
const EDITABLE_FIELDS = ["name", "description", "query", "params", "cache_enabled", "cache_ttl_seconds", "rate_limit_rpm", "active", "tags"] as const;

const QUERY_DESCRIPTION = `The TagoSQL statement: one read-only SELECT. Every FROM table is a table function with an alias, e.g. \`FROM device('DEVICE_ID') AS d\`: device('id') and entity('id') read one resource's data; device_tag and entity_tag read the FIRST resource matching the tag (lowest ID); device_data_by_tag('key','value', ...) returns the latest reading of every matching device; devices(), entities(), devices_tag, and entities_tag list resources, the tag forms returning EVERY match. Allowed: aliases, DISTINCT, COUNT/AVG/SUM/MIN/MAX, JOIN with ON (Starter plan or above), WHERE, IN, BETWEEN, IS NULL, LIKE/ILIKE, GROUP BY, HAVING, ORDER BY, LIMIT/OFFSET, arithmetic. Not allowed: subqueries, WITH, UNION, window functions, ::casts, writes. Always add LIMIT: a query without one saves, but fails at execution once its result exceeds the plan row cap. LIMIT and OFFSET take fixed numbers, never placeholders; page with a parameter cursor instead (e.g. WHERE time < $1). Use $1..$n placeholders for values, and in the id slot of device($1) or entity($1). The list tables and device_data_by_tag cannot be joined, and device_data_by_tag allows no aggregates or GROUP BY. In a JOIN, alias same-named columns apart (rows are keyed by column name). Call lookup_sql_tables for columns and functions.`;

/** Builds a fresh schema per use, so one tool never advertises a shared instance as a JSON Schema $ref. */
function sqlParamsSchema(description: string) {
  return z
    .array(
      z
        .object({
          key: z.string().regex(PARAM_KEY_PATTERN, 'must be a positional placeholder such as "$1"').describe('Placeholder, e.g. "$1".'),
          value: z.string().describe("Always a string; the server converts it to the type the query needs (number, timestamp, boolean, text)."),
        })
        .strict()
    )
    .superRefine((params, ctx) => {
      const seen = new Set<string>();
      for (const param of params) {
        if (seen.has(param.key)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: invalidParamMessage("params", `keys must be unique: "${param.key}" appears more than once`, PARAMS_EXAMPLE) });
        }
        seen.add(param.key);
      }
    })
    .describe(description);
}

function sqlQueryFields() {
  return {
    name: z.string().min(1).max(64).describe("Display name of the saved query (1-64 characters)."),
    description: z.string().max(1024).nullable().describe("Free text describing what the query returns (at most 1024 characters).").optional(),
    query: z.string().min(1).describe(QUERY_DESCRIPTION),
    params: sqlParamsSchema(
      "Stored default values for the query's $1..$n placeholders. They must cover every placeholder the query uses, numbered 1..N without gaps, each key once."
    ).optional(),
    cache_enabled: z
      .boolean()
      .describe("Serve repeat executions with the same parameter values from cache, free of Data Output. Off by default; takes effect only with cache_ttl_seconds above 0.")
      .optional(),
    cache_ttl_seconds: z.number().int().min(0).max(MAX_CACHE_TTL_SECONDS).describe(`How long a cached result stays fresh, at most ${MAX_CACHE_TTL_SECONDS} (24 hours).`).optional(),
    rate_limit_rpm: z.number().int().positive().nullable().describe("Per-query cap on executions per minute; null removes it.").optional(),
    active: z.boolean().describe("An inactive query cannot be executed.").optional(),
    tags: z.array(tagsObjectModel).describe("Tags for the query, also usable to grant execution through Access Management. E.g: [{ key: 'audience', value: 'portal' }]").optional(),
  };
}

export { EDITABLE_FIELDS, MAX_CACHE_TTL_SECONDS, sqlParamsSchema, sqlQueryFields };
