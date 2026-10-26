import type { SQLQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { amountSchema, pageSchema, responseFormatSchema, tagsObjectModel, wildcardFilter } from "../../../utils/global-params.model";
import { parseOrderBy } from "../../../utils/order-by";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

// The list route projects only these; query text and session_context come from get_sql_query.
const DEFAULT_FIELDS = ["id", "name", "active", "tags", "created_at", "updated_at"] as const;
const ORDER_FIELDS = ["name", "active", "created_at", "updated_at"] as const;
const DEFAULT_AMOUNT = 20;

const searchSqlQueriesSchema = {
  filter: z
    .object({
      name: z.string().describe("Partial query name. Wildcard matching is applied automatically ('fleet' finds 'Fleet temperatures').").optional(),
      tags: z.array(tagsObjectModel.partial()).describe("Filter by tags. E.g: [{ key: 'audience', value: 'portal' }]").optional(),
      active: z.boolean().describe("Filter by active status.").optional(),
      orderBy: z
        .string()
        .describe(`Sort as "field,direction". Field is one of: ${ORDER_FIELDS.join(", ")}; direction is asc or desc. E.g: "name,asc"`)
        .optional(),
    })
    .describe("Filters to narrow the search.")
    .optional(),
  page: pageSchema,
  amount: amountSchema(200, DEFAULT_AMOUNT),
  fields: z
    .array(z.enum(DEFAULT_FIELDS))
    .describe(
      "Fields to include per query. Defaults to all key fields. Also controls the rendered columns: when supplied, output shows exactly these fields, even in concise mode."
    )
    .optional(),
  response_format: responseFormatSchema,
};

type SearchSqlQueriesParams = z.infer<z.ZodObject<typeof searchSqlQueriesSchema>>;

async function searchSqlQueriesTool(context: ServerContext, params: SearchSqlQueriesParams): Promise<string> {
  const amount = params.amount ?? DEFAULT_AMOUNT;
  const query: SQLQuery = {
    amount,
    page: params.page,
    fields: [...(params.fields ?? DEFAULT_FIELDS)],
  };
  if (params.filter) {
    const { orderBy, ...filterFields } = params.filter;
    query.filter = wildcardFilter(filterFields, ["name"]) as SQLQuery["filter"];
    if (orderBy) {
      query.orderBy = parseOrderBy(orderBy, ORDER_FIELDS);
    }
  }

  const queries = await context.resources.sql.list(query);
  return renderList({
    items: queries as unknown as Record<string, unknown>[],
    conciseFields: ["id", "name", "active", "tags"],
    selectedFields: params.fields,
    responseFormat: params.response_format,
    requestedAmount: amount,
    page: params.page,
    resourceLabel: "SQL queries",
    emptyHint: "Broaden the name filter (wildcards are automatic) or drop filters. Create one with create_sql_query.",
  });
}

const searchSqlQueriesConfigJSON: IToolConfig = {
  name: "search_sql_queries",
  description: `Searches the profile's saved TagoSQL queries by name, tags, or active status.

Use when you need to find a saved query, list what exists, or resolve a query name to its ID before calling get_sql_query or execute_sql_query. Name filtering is wildcard-based, so partial names work. The list shows metadata only; the SQL text, parameters, and whether the query uses session context come from get_sql_query. With an analysis token, this needs \`sql\` / \`access\`.

<example>
{"filter": {"name": "temperature", "active": true}, "amount": 20}
</example>`,
  parameters: searchSqlQueriesSchema,
  title: "Search SQL Queries",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: searchSqlQueriesTool,
};

export { searchSqlQueriesConfigJSON };
