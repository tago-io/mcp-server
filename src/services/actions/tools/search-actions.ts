import type { ActionQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { amountSchema, pageSchema, responseFormatSchema, tagsObjectModel, wildcardFilter } from "../../../utils/global-params.model";
import { parseOrderBy } from "../../../utils/order-by";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const ACTION_FIELDS = ["id", "active", "name", "created_at", "updated_at", "last_triggered", "tags", "type", "action"] as const;
const ORDER_FIELDS = ["name", "active", "last_triggered", "created_at", "updated_at"] as const;
const DEFAULT_AMOUNT = 20;

const searchActionsBaseSchema = z.object({
  filter: z
    .object({
      name: z
        .string()
        .describe('Filter by action name. Wildcard matching is applied automatically, so "notification" matches "Notification Action" and "Notification Action 2".')
        .optional(),
      active: z.boolean().describe("Filter by active status. E.g: true").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'action_type', value: 'notification' }]").optional(),
      created_at: z.string().describe("Filter by creation date. E.g: '2021-01-01'").optional(),
      updated_at: z.string().describe("Filter by last update date. E.g: '2021-01-01'").optional(),
      orderBy: z
        .string()
        .describe(`Sort as "field,direction". Field is one of: ${ORDER_FIELDS.join(", ")}; direction is asc or desc. E.g: "name,asc"`)
        .optional(),
    })
    .describe("Filter object to apply to the query.")
    .optional(),
  page: pageSchema,
  amount: amountSchema(200, DEFAULT_AMOUNT),
  fields: z
    .array(z.enum(ACTION_FIELDS))
    .describe(
      `Fields to request from the API. Defaults to all of: ${ACTION_FIELDS.join(", ")}. Also controls the rendered columns: when supplied, output shows exactly these fields, even in concise mode.`
    )
    .optional(),
  response_format: responseFormatSchema,
});

type SearchActionsSchema = z.infer<typeof searchActionsBaseSchema>;

async function searchActionsTool(context: ServerContext, params: SearchActionsSchema): Promise<string> {
  const { filter, page, response_format } = params;
  const amount = params.amount ?? DEFAULT_AMOUNT;
  const fields = params.fields ?? [...ACTION_FIELDS];

  const query: ActionQuery = { amount, fields };
  if (page) {
    query.page = page;
  }
  if (filter) {
    const { orderBy, ...filterFields } = filter;
    query.filter = wildcardFilter(filterFields, ["name"]) as ActionQuery["filter"];
    if (orderBy) {
      query.orderBy = parseOrderBy(orderBy, ORDER_FIELDS);
    }
  }

  const actions = await context.resources.actions.list(query);

  return renderList({
    items: actions as unknown as Record<string, unknown>[],
    conciseFields: ["id", "name", "type", "active", "last_triggered"],
    selectedFields: params.fields,
    responseFormat: response_format,
    requestedAmount: amount,
    page,
    resourceLabel: "actions",
  });
}

const searchActionsConfigJSON: IToolConfig = {
  name: "search_actions",
  description: `Searches automation actions in the TagoIO profile, filtered by name, active status, tags, or creation/update dates, and returns a paginated list. Actions are automated workflows that execute a response (run a script, send a notification, post to a URL, etc.) when a trigger fires.

Use this when you need to find action IDs or review existing automations before getting, updating, or deleting one. The name filter uses wildcard matching automatically, so a partial name like "notification" is enough.

<example>
{
  "filter": { "name": "notification", "active": true },
  "amount": 20
}
</example>

Key limitations: returns at most 200 actions per page; the concise view omits trigger and action configuration; use get_action or response_format "detailed" for those.`,
  parameters: searchActionsBaseSchema.shape,
  title: "Search Actions",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: searchActionsTool,
};

export { searchActionsConfigJSON };
