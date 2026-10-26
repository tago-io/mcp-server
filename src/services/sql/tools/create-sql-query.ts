import type { SQLCreateInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { pickDefined } from "../../../utils/pick-defined";
import { IToolConfig, ServerContext } from "../../types";
import { sqlQueryFields } from "../sql-schemas";

const createSqlQueryBaseSchema = z.object(sqlQueryFields());

type CreateSqlQuerySchema = z.infer<typeof createSqlQueryBaseSchema>;

async function createSqlQueryTool(context: ServerContext, params: CreateSqlQuerySchema): Promise<string> {
  // The API validates the SQL on save; its message (e.g. "Only SELECT statements are allowed") reaches the caller through the root error boundary.
  const created = await context.resources.sql.create(pickDefined(params) as SQLCreateInfo);
  const lines = [`SQL query created with ID \`${created.id}\` (version ${created.version}). Run it with execute_sql_query (\`test: true\` while iterating).`];
  if (created.session_context) {
    lines.push(
      "It uses session context: each TagoRUN user gets rows for their own session, a profile run uses the COALESCE fallback (and fails without one), and an analysis cannot execute it."
    );
  }
  return lines.join("\n");
}

const createSqlQueryConfigJSON: IToolConfig = {
  name: "create_sql_query",
  description: `Saves a new TagoSQL query on the profile. The server validates the SQL, the parameters, and the plan limits it can check from the text (such as a written LIMIT above the row cap or JOINs on the Free plan) on save; other failures only appear at execution, e.g. a result past the row cap, an invalid parameter value, or a device without data.

Use this to answer a data question with SQL, or to give a widget, analysis, Custom Dashboard, or TagoRUN portal a query to run by ID. There is no execution without saving: to explore, save a scratch query, run it with execute_sql_query (\`test: true\`), and refine it with update_sql_query; each content change keeps a version. Call lookup_sql_tables first for the table functions, their columns, your device and entity IDs, and the callable functions.

A TagoRUN user or analysis runs a saved query only with an Access Management grant on resource \`sql\` (action \`execute\`, or \`ai_access\` for the TagoRUN AI Chat), matched by the query's ID or tags; see lookup_access_permissions. With an analysis token, this tool itself needs \`sql\` / \`create\`. The grant returns the query's full result, so write the query for its audience. To scope one query per TagoRUN user, use session_user_tag('key') or session_user_id() in a table selector, wrapped as COALESCE(session_user_tag('key'), 'fallback') so a profile run can test it.

<example>
{
  "name": "Hot compressors",
  "description": "Readings above a threshold",
  "query": "SELECT variable, value, time FROM device('61f0000000000000000d0001') AS d WHERE value > $1 ORDER BY time DESC LIMIT 100",
  "params": [{ "key": "$1", "value": "30" }],
  "cache_enabled": true,
  "cache_ttl_seconds": 60
}
</example>

Key limitations: one SELECT per query; always add LIMIT; params values are strings and must cover every placeholder; cache_ttl_seconds is capped at 86400; the stored query count is a plan limit.`,
  parameters: createSqlQueryBaseSchema.shape,
  title: "Create SQL Query",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: createSqlQueryTool,
};

export { createSqlQueryConfigJSON };
