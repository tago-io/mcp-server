import type { DashboardQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { amountSchema, pageSchema, responseFormatSchema, tagsObjectModel, wildcardFilter } from "../../../utils/global-params.model";
import { parseOrderBy } from "../../../utils/order-by";
import { stripTokenFields } from "../../../utils/strip-token-fields";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

// Dashboards use `label` (not `name`) as their display identity; the SDK
// defaults fields to ["id","name"], so fields are always passed explicitly.
const DEFAULT_FIELDS = ["id", "label", "active", "visible", "tags", "type", "created_at", "updated_at", "last_access"] as const;
const ORDER_FIELDS = ["label", "active", "created_at", "updated_at"] as const;
const DEFAULT_AMOUNT = 20;

const searchDashboardsSchema = {
  filter: z
    .object({
      label: z.string().describe("Partial dashboard label. Wildcard matching is applied automatically ('fleet' finds 'Fleet Overview').").optional(),
      tags: z.array(tagsObjectModel.partial()).describe("Filter by tags. E.g: [{ key: 'team', value: 'ops' }]").optional(),
      created_at: z.string().describe("Filter by creation date. E.g: '2026-01-01'").optional(),
      updated_at: z.string().describe("Filter by update date. E.g: '2026-01-01'").optional(),
      orderBy: z
        .string()
        .describe(`Sort as "field,direction". Field is one of: ${ORDER_FIELDS.join(", ")}; direction is asc or desc. E.g: "label,asc"`)
        .optional(),
    })
    .describe("Filters to narrow the search.")
    .optional(),
  page: pageSchema,
  amount: amountSchema(200, DEFAULT_AMOUNT),
  fields: z
    .array(z.enum(DEFAULT_FIELDS))
    .describe(
      "Fields to include per dashboard. Defaults to all key fields. Also controls the rendered columns: when supplied, output shows exactly these fields, even in concise mode."
    )
    .optional(),
  response_format: responseFormatSchema,
};

type SearchDashboardsParams = z.infer<z.ZodObject<typeof searchDashboardsSchema>>;

async function searchDashboardsTool(context: ServerContext, params: SearchDashboardsParams): Promise<string> {
  const amount = params.amount ?? DEFAULT_AMOUNT;
  const fields = params.fields ?? [...DEFAULT_FIELDS];
  const query: DashboardQuery = {
    amount,
    page: params.page,
    fields: fields as DashboardQuery["fields"],
  };
  if (params.filter) {
    const { orderBy, ...filterFields } = params.filter;
    query.filter = wildcardFilter(filterFields, ["label"]) as DashboardQuery["filter"];
    if (orderBy) {
      // The SDK's orderBy tuple type omits "active" even though the API sorts by it.
      query.orderBy = parseOrderBy(orderBy, ORDER_FIELDS) as DashboardQuery["orderBy"];
    }
  }

  const dashboards = await context.resources.dashboards.list(query);
  return renderList({
    items: stripTokenFields(dashboards) as Record<string, unknown>[],
    conciseFields: ["id", "label", "type", "visible", "created_at"],
    selectedFields: params.fields,
    responseFormat: params.response_format,
    requestedAmount: amount,
    page: params.page,
    resourceLabel: "dashboards",
    emptyHint: "Broaden the label filter (wildcards are automatic) or drop filters.",
  });
}

const searchDashboardsConfigJSON: IToolConfig = {
  name: "search_dashboards",
  description: `Searches the dashboards in the TagoIO account by label, tags, or dates.

Use when you need to find dashboards, list what exists, or resolve a dashboard label to its ID before calling get_dashboard. Dashboards are identified by label (not name); label filtering is wildcard-based, so partial labels work. Returns a concise table by default; a full page means more results may exist (paginate or narrow).

<example>
{"filter": {"label": "fleet"}, "amount": 20}
</example>`,
  parameters: searchDashboardsSchema,
  title: "Search Dashboards",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: searchDashboardsTool,
};

export { searchDashboardsConfigJSON };
