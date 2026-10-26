import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { IToolConfig, ServerContext } from "../../types";

const getSqlQueryVersionSchema = {
  sql_query_id: resourceIdSchema("SQL query ID"),
  version: z.number().int().min(1).describe("Version number, as get_sql_query reports it. Version 1 is the query as first saved."),
};

type GetSqlQueryVersionParams = z.infer<z.ZodObject<typeof getSqlQueryVersionSchema>>;

async function getSqlQueryVersionTool(context: ServerContext, params: GetSqlQueryVersionParams): Promise<string> {
  const snapshot = await context.resources.sql.getVersion(params.sql_query_id, params.version);
  const rendered = convertJSONToMarkdown(snapshot);
  return `${rendered}\n\nTo restore it, send this \`query\` and \`params\` to update_sql_query; the restored content becomes the newest version.`;
}

const getSqlQueryVersionConfigJSON: IToolConfig = {
  name: "get_sql_query_version",
  description: `Fetches one saved version of a TagoSQL query: the SQL text and parameter defaults as they were at that version.

Use to compare a query with an earlier revision or to restore one. Each change to a query's \`query\` or \`params\` saves the next version; get_sql_query shows the current version number and the version history. How many versions are kept depends on the plan; the oldest are recycled beyond that.

<example>
{"sql_query_id": "61f0000000000000000c5001", "version": 1}
</example>`,
  parameters: getSqlQueryVersionSchema,
  title: "Get SQL Query Version",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getSqlQueryVersionTool,
};

export { getSqlQueryVersionConfigJSON };
