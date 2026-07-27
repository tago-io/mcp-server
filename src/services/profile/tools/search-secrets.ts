import type { SecretsQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { amountSchema, pageSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { parseOrderBy } from "../../../utils/order-by";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const DEFAULT_FIELDS = ["id", "key", "tags", "value_length", "created_at", "updated_at"] as const;
const ORDER_FIELDS = ["key"] as const;
const DEFAULT_AMOUNT = 20;

const searchSecretsSchema = {
  filter: z
    .object({
      id: z.string().length(24, "Secret ID must be 24 characters long").describe("Exact secret ID.").optional(),
      key: z.string().describe("Filter by secret key name.").optional(),
      orderBy: z
        .string()
        .describe(`Sort as "field,direction". Field is one of: ${ORDER_FIELDS.join(", ")}; direction is asc or desc. E.g: "key,asc"`)
        .optional(),
    })
    .describe("Filters to narrow the search.")
    .optional(),
  page: pageSchema,
  amount: amountSchema(200, DEFAULT_AMOUNT),
  fields: z
    .array(z.enum(DEFAULT_FIELDS))
    .describe(
      "Fields to include per secret. Defaults to all key fields. Also controls the rendered columns: when supplied, output shows exactly these fields, even in concise mode."
    )
    .optional(),
  response_format: responseFormatSchema,
};

type SearchSecretsParams = z.infer<z.ZodObject<typeof searchSecretsSchema>>;

async function searchSecretsTool(context: ServerContext, params: SearchSecretsParams): Promise<string> {
  const amount = params.amount ?? DEFAULT_AMOUNT;
  const query: SecretsQuery = {
    amount,
    page: params.page,
    fields: (params.fields ?? [...DEFAULT_FIELDS]) as SecretsQuery["fields"],
  };
  if (params.filter) {
    const { orderBy, ...filterFields } = params.filter;
    query.filter = filterFields;
    if (orderBy) {
      query.orderBy = parseOrderBy(orderBy, ORDER_FIELDS);
    }
  }

  const secrets = await context.resources.secrets.list(query);
  return renderList({
    items: secrets as unknown as Record<string, unknown>[],
    conciseFields: ["id", "key"],
    selectedFields: params.fields,
    responseFormat: params.response_format,
    requestedAmount: amount,
    page: params.page,
    resourceLabel: "secrets",
    emptyHint: "Broaden the key filter or drop filters.",
  });
}

const searchSecretsConfigJSON: IToolConfig = {
  name: "search_secrets",
  description: `Lists the current profile's secrets (named values used by analyses for credentials and API keys) by key name or ID. Secret values are never returned; the TagoIO API only exposes metadata such as id, key, and value length.

Use when you need to check which secrets exist, confirm a secret key name before referencing it in an analysis, or find a secret's ID. Not for reading secret values; those are only available inside analyses at runtime.

<example>
{"filter": {"key": "API"}, "amount": 20}
</example>`,
  parameters: searchSecretsSchema,
  title: "Search Profile Secrets",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: searchSecretsTool,
};

export { searchSecretsConfigJSON };
