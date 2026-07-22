import type { EntityQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { amountSchema, pageSchema, responseFormatSchema, tagsObjectModel, wildcardFilter } from "../../../utils/global-params.model";
import { parseOrderBy } from "../../../utils/order-by";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const DEFAULT_FIELDS = ["id", "name", "schema", "index", "tags", "created_at", "updated_at"] as const;
const ORDER_FIELDS = ["name", "created_at", "updated_at"] as const;
const DEFAULT_AMOUNT = 20;

const searchEntitiesSchema = {
  filter: z
    .object({
      id: z.string().length(24, "Entity ID must be 24 characters long").describe("Exact entity ID.").optional(),
      name: z.string().describe("Partial entity name. Wildcard matching is applied automatically ('sensor' finds 'Temperature Sensor').").optional(),
      tags: z.array(tagsObjectModel.partial()).describe("Filter by tags. E.g: [{ key: 'entity_type', value: 'sensor' }]").optional(),
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
    .describe(
      "Fields to include per entity. Defaults to all key fields. Also controls the rendered columns: when supplied, output shows exactly these fields, even in concise mode."
    )
    .optional(),
  response_format: responseFormatSchema,
};

type SearchEntitiesParams = z.infer<z.ZodObject<typeof searchEntitiesSchema>>;

async function searchEntitiesTool(context: ServerContext, params: SearchEntitiesParams): Promise<string> {
  const amount = params.amount ?? DEFAULT_AMOUNT;
  const query: EntityQuery = {
    amount,
    page: params.page,
    fields: (params.fields ?? [...DEFAULT_FIELDS]) as EntityQuery["fields"],
  };
  if (params.filter) {
    const { orderBy, ...filterFields } = params.filter;
    query.filter = wildcardFilter(filterFields, ["name"]) as EntityQuery["filter"];
    if (orderBy) {
      query.orderBy = parseOrderBy(orderBy, ORDER_FIELDS);
    }
  }

  const entities = await context.resources.entities.list(query);
  return renderList({
    items: entities as unknown as Record<string, unknown>[],
    conciseFields: ["id", "name", "tags"],
    selectedFields: params.fields,
    responseFormat: params.response_format,
    requestedAmount: amount,
    page: params.page,
    resourceLabel: "entities",
    emptyHint: "Broaden the name filter (wildcards are automatic) or drop filters.",
  });
}

const searchEntitiesConfigJSON: IToolConfig = {
  name: "search_entities",
  description: `Searches the entities in the TagoIO account by name, tags, or dates. Entities are TagoIO's schema-based database tables with flexible schemas and indexes, the successor to Mutable Devices for structured data.

Use when you need to find entities, list what exists, or resolve an entity name to its ID before calling get_entity. Name filtering is wildcard-based, so partial names work. Returns entity metadata and configuration only, not the data rows stored inside entities.

<example>
{"filter": {"name": "sensor", "tags": [{"key": "entity_type", "value": "sensor"}]}, "amount": 20}
</example>`,
  parameters: searchEntitiesSchema,
  title: "Search Entities",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: searchEntitiesTool,
};

export { searchEntitiesConfigJSON };
