import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";

const deleteSqlQueryBaseSchema = z.object({
  sql_query_id: resourceIdSchema("SQL query ID"),
});

type DeleteSqlQuerySchema = z.infer<typeof deleteSqlQueryBaseSchema>;

async function deleteSqlQueryTool(context: ServerContext, params: DeleteSqlQuerySchema): Promise<string> {
  await context.resources.sql.delete(params.sql_query_id);
  return `SQL query \`${params.sql_query_id}\` permanently deleted, including its version history.`;
}

const deleteSqlQueryConfigJSON: IToolConfig = {
  name: "delete_sql_query",
  description: `Permanently deletes a saved TagoSQL query by ID. The query and its whole version history are removed and cannot be recovered.

Use this only when the user explicitly asks to remove a query. Confirm the target with get_sql_query or search_sql_queries first if there is any ambiguity about which query is meant.

<example>
{ "sql_query_id": "61f0000000000000000c5001" }
</example>

Key limitations: deletion cannot be undone; with an analysis token it needs \`sql\` / \`delete\`; widgets, analyses, Custom Dashboards, and TagoRUN portals that execute the query by ID stop getting data.`,
  parameters: deleteSqlQueryBaseSchema.shape,
  title: "Delete SQL Query",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteSqlQueryTool,
};

export { deleteSqlQueryConfigJSON };
