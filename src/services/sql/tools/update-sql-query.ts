import type { SQLCreateInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { requireAtLeastOne } from "../../../utils/cross-field";
import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";
import { EDITABLE_FIELDS, sqlQueryFields } from "../sql-schemas";

const UPDATE_EXAMPLE = '{ "sql_query_id": "61f0000000000000000c5001", "params": [{ "key": "$1", "value": "40" }] }';

const fields = sqlQueryFields();

const updateSqlQueryBaseSchema = z.object({
  sql_query_id: resourceIdSchema("SQL query ID"),
  ...fields,
  name: fields.name.describe("The new display name (1-64 characters).").optional(),
  query: fields.query.optional(),
});

type UpdateSqlQuerySchema = z.infer<typeof updateSqlQueryBaseSchema>;

const updateSqlQueryCrossField = requireAtLeastOne(EDITABLE_FIELDS, "sql_query_id", "at least one field to update must be provided alongside it", UPDATE_EXAMPLE);

/** The API replaces the whole query on edit, so every stored field is resent with the caller's changes on top. */
function mergedBody(current: Record<string, unknown>, params: UpdateSqlQuerySchema): SQLCreateInfo {
  const body: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    body[field] = params[field] !== undefined ? params[field] : current[field];
  }
  return body as unknown as SQLCreateInfo;
}

async function updateSqlQueryTool(context: ServerContext, params: UpdateSqlQuerySchema): Promise<string> {
  const current = (await context.resources.sql.info(params.sql_query_id)) as unknown as Record<string, unknown>;
  const updated = await context.resources.sql.edit(params.sql_query_id, mergedBody(current, params));

  const versioned = updated.version !== current.version;
  const version = versioned
    ? `saved as version ${updated.version}; earlier versions stay readable with get_sql_query_version`
    : `still version ${updated.version} (only query or params changes create a version)`;
  return `SQL query \`${params.sql_query_id}\` updated, ${version}. Cached results were dropped.`;
}

const updateSqlQueryConfigJSON: IToolConfig = {
  name: "update_sql_query",
  description: `Updates a saved TagoSQL query by ID. Only the provided fields change; the server validates the result again before saving.

Use this to refine a query while exploring (save, execute with \`test: true\`, refine), to change its parameter defaults, cache, rate limit, active status, or tags, or to restore an older version: read it with get_sql_query_version and send its \`query\` and \`params\` here. Changing \`query\` or \`params\` saves a new version; renames and other metadata changes do not. When a new \`query\` adds, removes, or renumbers placeholders, send the matching \`params\` in the same call, or the stored defaults no longer fit and the save fails. Every edit drops the query's cached results. With an analysis token, this needs \`sql\` / \`access\` (the stored query is read first) and \`sql\` / \`edit\`.

<example>
${UPDATE_EXAMPLE}
</example>

Key limitations: at least one field must be provided; \`params\` and \`tags\` replace the stored sets entirely; deactivating a query makes every execution fail until it is reactivated.`,
  parameters: updateSqlQueryBaseSchema.shape,
  title: "Update SQL Query",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: updateSqlQueryCrossField,
  tool: updateSqlQueryTool,
};

export { updateSqlQueryConfigJSON };
