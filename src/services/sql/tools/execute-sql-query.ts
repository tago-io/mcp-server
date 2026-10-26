import type { SQLExecuteObj } from "@tago-io/sdk";
import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { pickDefined } from "../../../utils/pick-defined";
import { IToolConfig, ServerContext } from "../../types";
import { renderExecution } from "../render-execution";
import { sqlParamsSchema } from "../sql-schemas";

const executeSqlQuerySchema = {
  sql_query_id: resourceIdSchema("SQL query ID"),
  params: sqlParamsSchema("Values for this run only, overriding the stored defaults per key; stored defaults fill the rest.").optional(),
  test: z.boolean().describe("Skip the result cache entirely (no read, no write) while iterating on a query. Still counts against Data Output and rate limits.").optional(),
  after_device: resourceIdSchema("device ID")
    .describe("Fleet queries (device_data_by_tag) only: the last device ID of the previous page, to fetch the next page. Order the query by device.")
    .optional(),
};

type ExecuteSqlQueryParams = z.infer<z.ZodObject<typeof executeSqlQuerySchema>>;

async function executeSqlQueryTool(context: ServerContext, params: ExecuteSqlQueryParams): Promise<string> {
  const body = pickDefined({ params: params.params, test: params.test, after_device: params.after_device }) as SQLExecuteObj;
  const result = await context.resources.sql.execute(params.sql_query_id, body);
  return renderExecution(result);
}

const executeSqlQueryConfigJSON: IToolConfig = {
  name: "execute_sql_query",
  description: `Runs a saved TagoSQL query by ID and returns its typed columns and rows.

Use to answer a data question with a saved query or to check a query while writing it. A fresh execution counts against the profile's Data Output; a repeat with the same parameter values on a query with \`cache_enabled\` is served from cache for free (the result says which path it took). Use \`test: true\` while iterating so the cache is neither read nor written.

Results are never silently shortened by the server: a query whose result would exceed the plan's row cap fails with an error instead, so add LIMIT and page with a parameter cursor (e.g. WHERE time < $1). Fleet queries (device_data_by_tag) page over devices with \`after_device\`; past the last device the API answers "No device found with tag", which means the fleet is exhausted, not that the query is broken. Without \`after_device\`, the same error means no active device carries all the tags: check the tag keys and values. A query using session context returns the profile owner's COALESCE fallback here, and an analysis token cannot run it.

<example>
{"sql_query_id": "61f0000000000000000c5001", "params": [{ "key": "$1", "value": "40" }], "test": true}
</example>

Key limitations: only saved queries run (create_sql_query first); an inactive query fails; with an analysis token it needs the Access Management grant \`sql\` / \`execute\`, matched by the query's ID or tags; very large results are cut in the rendered output to stay within the response budget, with the count of rows shown.`,
  parameters: executeSqlQuerySchema,
  title: "Execute SQL Query",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: executeSqlQueryTool,
};

export { executeSqlQueryConfigJSON };
