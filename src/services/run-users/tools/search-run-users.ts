import type { UserQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { amountSchema, pageSchema, responseFormatSchema, tagsObjectModel, wildcardFilter } from "../../../utils/global-params.model";
import { parseOrderBy } from "../../../utils/order-by";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const DEFAULT_FIELDS = ["id", "name", "email", "timezone", "company", "phone", "language", "tags", "active", "last_login", "created_at", "updated_at"] as const;
const ORDER_FIELDS = ["name", "active", "last_login", "created_at", "updated_at"] as const;
const DEFAULT_AMOUNT = 20;

const searchRunUsersSchema = {
  filter: z
    .object({
      id: z.string().length(24, "Run user ID must be 24 characters long").describe("Exact run user ID.").optional(),
      name: z.string().describe("Partial user name. Wildcard matching is applied automatically ('john' finds 'John Doe' and 'Johnny Smith').").optional(),
      email: z.string().describe("Partial email. Wildcard matching is applied automatically ('gmail' finds 'user@gmail.com').").optional(),
      active: z.boolean().describe("Filter by active status.").optional(),
      tags: z.array(tagsObjectModel.partial()).describe("Filter by tags. E.g: [{ key: 'user_type', value: 'admin' }]").optional(),
      created_at: z.string().describe("Filter by creation date. E.g: '2026-01-01'").optional(),
      updated_at: z.string().describe("Filter by update date. E.g: '2026-01-01'").optional(),
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
    .describe("Fields to include per user. Defaults to all key fields. Also controls the rendered columns: when supplied, output shows exactly these fields, even in concise mode.")
    .optional(),
  response_format: responseFormatSchema,
};

type SearchRunUsersParams = z.infer<z.ZodObject<typeof searchRunUsersSchema>>;

async function searchRunUsersTool(context: ServerContext, params: SearchRunUsersParams): Promise<string> {
  const amount = params.amount ?? DEFAULT_AMOUNT;
  // A bare call must list users: the query always carries defaults, never a required filter.
  const query: UserQuery = {
    amount,
    page: params.page,
    fields: (params.fields ?? [...DEFAULT_FIELDS]) as UserQuery["fields"],
  };
  if (params.filter) {
    const { orderBy, ...filterFields } = params.filter;
    query.filter = wildcardFilter(filterFields, ["name", "email"]) as UserQuery["filter"];
    if (orderBy) {
      query.orderBy = parseOrderBy(orderBy, ORDER_FIELDS);
    }
  }

  const users = await context.resources.run.listUsers(query);
  return renderList({
    items: users as unknown as Record<string, unknown>[],
    conciseFields: ["id", "name", "email", "active"],
    selectedFields: params.fields,
    responseFormat: params.response_format,
    requestedAmount: amount,
    page: params.page,
    resourceLabel: "run users",
    emptyHint: "Broaden the name or email filter (wildcards are automatic) or drop filters.",
  });
}

const searchRunUsersConfigJSON: IToolConfig = {
  name: "search_run_users",
  description: `Searches the end users of the account's TagoRUN portal (TagoIO's white-label application for end users) by name, email, tags, or activity.

Use when you need to find TagoRUN users, list who has access, or resolve a user's name or email to their ID before calling get_run_user. Name and email filtering are wildcard-based, so partial values work. Calling with no filters lists all users. This tool covers TagoRUN end users only, not TagoIO account team members.

<example>
{"filter": {"name": "john", "active": true}, "amount": 20}
</example>`,
  parameters: searchRunUsersSchema,
  title: "Search Run Users",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: searchRunUsersTool,
};

export { searchRunUsersConfigJSON };
