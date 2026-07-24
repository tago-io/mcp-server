import type { AccessQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { amountSchema, pageSchema, responseFormatSchema, tagsObjectModel, wildcardFilter } from "../../../utils/global-params.model";
import { parseOrderBy } from "../../../utils/order-by";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

/**
 * The list endpoint reads only the policy table, so it never returns
 * `permissions` or `targets`. Advertising them as selectable fields would
 * promise columns the API cannot fill, so they are absent here and callers are
 * steered to get_access_policy, which is the only source of a policy's rules.
 */
const POLICY_FIELDS = ["id", "name", "active", "tags", "created_at", "updated_at"] as const;
const ORDER_FIELDS = ["name", "active", "created_at", "updated_at"] as const;
const DEFAULT_AMOUNT = 20;

const searchAccessPoliciesBaseSchema = z.object({
  filter: z
    .object({
      name: z.string().describe('Filter by policy name. Wildcard matching is applied automatically, so "analysis" matches "[Analysis] - Parser".').optional(),
      active: z.boolean().describe("Filter by active status. An inactive policy grants nothing. E.g: true").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'purpose', value: 'parser' }]").optional(),
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
    .array(z.enum(POLICY_FIELDS))
    .describe(
      `Fields to request from the API. Defaults to all of: ${POLICY_FIELDS.join(", ")}. Also controls the rendered columns: when supplied, output shows exactly these fields, even in concise mode. A policy's rules and targets are not available here at all.`
    )
    .optional(),
  response_format: responseFormatSchema,
});

type SearchAccessPoliciesSchema = z.infer<typeof searchAccessPoliciesBaseSchema>;

async function searchAccessPoliciesTool(context: ServerContext, params: SearchAccessPoliciesSchema): Promise<string> {
  const { filter, page, response_format } = params;
  const amount = params.amount ?? DEFAULT_AMOUNT;
  const fields = params.fields ?? [...POLICY_FIELDS];

  const query: AccessQuery = { amount, fields: fields as AccessQuery["fields"] };
  if (page) {
    query.page = page;
  }
  if (filter) {
    const { orderBy, ...filterFields } = filter;
    query.filter = wildcardFilter(filterFields, ["name"]) as AccessQuery["filter"];
    if (orderBy) {
      query.orderBy = parseOrderBy(orderBy, ORDER_FIELDS) as AccessQuery["orderBy"];
    }
  }

  const policies = await context.resources.accessManagement.list(query);

  const rendered = renderList({
    items: policies as unknown as Record<string, unknown>[],
    conciseFields: ["id", "name", "active", "tags"],
    selectedFields: params.fields,
    responseFormat: response_format,
    requestedAmount: amount,
    page,
    resourceLabel: "access policies",
    emptyHint:
      'With no policies, every analysis and run_user token is denied everything beyond its own resource, which is what an unexplained "Authorization Denied" at runtime usually means. Use lookup_access_permissions to find the grant an operation needs, then create_access_policy.',
  });

  return `${rendered}\n\nThis endpoint does not return a policy's rules or targets. Read them with get_access_policy.`;
}

const searchAccessPoliciesConfigJSON: IToolConfig = {
  name: "search_access_policies",
  description: `Searches the Access Management policies in the TagoIO profile, filtered by name, active status, or tags, and returns a paginated list.

Access Management policies are what grant an analysis or a TagoRUN user permission to touch resources they do not own. An analysis that fails at runtime with "Authorization Denied" is almost always missing one, so start here: if no policy targets the analysis, that is the answer.

Use lookup_access_permissions to find which grant an operation needs, and get_access_policy to read a policy's actual rules.

<example>
{ "filter": { "active": true }, "amount": 20 }
</example>

Key limitations: returns at most 200 policies per page; the list endpoint returns no rules and no targets, so it cannot tell you what a policy grants or who it applies to; profile tokens bypass Access Management entirely, so these policies never affect what this MCP server itself can do.`,
  parameters: searchAccessPoliciesBaseSchema.shape,
  title: "Search Access Policies",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: searchAccessPoliciesTool,
};

export { POLICY_FIELDS, searchAccessPoliciesConfigJSON };
