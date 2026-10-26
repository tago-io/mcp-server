import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

// The SQL text and its parameters are what a caller needs to reason about a
// query, so they belong in the concise view.
const CONCISE_FIELDS = ["id", "name", "active", "query", "params", "version", "session_context", "tags", "updated_at"];

const getSqlQuerySchema = {
  sql_query_id: resourceIdSchema("SQL query ID"),
  response_format: responseFormatSchema,
};

type GetSqlQueryParams = z.infer<z.ZodObject<typeof getSqlQuerySchema>>;

async function getSqlQueryTool(context: ServerContext, params: GetSqlQueryParams): Promise<string> {
  const query = (await context.resources.sql.info(params.sql_query_id)) as unknown as Record<string, unknown>;
  return renderItem(query, CONCISE_FIELDS, params.response_format);
}

const getSqlQueryConfigJSON: IToolConfig = {
  name: "get_sql_query",
  description: `Fetches one saved TagoSQL query by ID: its SQL text, stored parameter defaults, current version, and whether it uses session context.

Use before editing or executing a query, to read what it selects and which $n parameters it expects. The detailed view adds the cache settings, rate limit, description, and version history. \`session_context: true\` means the query calls session_user_id() or session_user_tag(), so its rows depend on the TagoRUN user who runs it. With an analysis token, this needs \`sql\` / \`access\`.

<example>
{"sql_query_id": "61f0000000000000000c5001"}
</example>`,
  parameters: getSqlQuerySchema,
  title: "Get SQL Query",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getSqlQueryTool,
};

export { getSqlQueryConfigJSON };
