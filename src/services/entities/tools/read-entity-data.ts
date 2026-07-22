import type { EntityDataQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { amountSchema, pageSchema, resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";
import { DEFAULT_ENTITY_DATA_INDEX, validateEntityDataFields, validateEntityDataQueryTarget } from "../entity-data";

const READ_EXAMPLE = '{ "entity_id": "61f0000000000000000f0001", "index": "temp_idx", "filter": { "temperature": "30" }, "amount": 50 }';
const DEFAULT_AMOUNT = 20;

const readEntityDataSchema = {
  entity_id: resourceIdSchema("entity ID"),
  index: z.string().describe(`Index to query through (from get_entity). Defaults to the server's \`${DEFAULT_ENTITY_DATA_INDEX}\` index (fields: id, created_at).`).optional(),
  filter: z
    .record(z.string())
    .describe("Field/value pairs to match. Keys must be fields of the chosen index, forming a left-to-right prefix of it (skipping an intermediate field is invalid).")
    .optional(),
  page: pageSchema,
  amount: amountSchema(10000, DEFAULT_AMOUNT),
  fields: z
    .array(z.string())
    .describe("Schema fields to return per row. Also controls the rendered columns: when supplied, output shows exactly these fields, even in concise mode.")
    .optional(),
  order_by: z.enum(["asc", "desc"]).describe("Sort direction, applied to the chosen index's LAST field; there is no arbitrary order-by.").optional(),
  response_format: responseFormatSchema,
};

type ReadEntityDataParams = z.infer<z.ZodObject<typeof readEntityDataSchema>>;

async function readEntityDataTool(context: ServerContext, params: ReadEntityDataParams): Promise<string> {
  // Prefetch the entity so index/filter/fields validation can steer with the
  // entity's actual indexes and schema instead of an opaque server error.
  const entity = (await context.resources.entities.info(params.entity_id)) as unknown as {
    schema?: Record<string, unknown>;
    index?: Record<string, { fields?: string[] }>;
  };
  validateEntityDataQueryTarget(entity, params.index, params.filter, READ_EXAMPLE);
  validateEntityDataFields(entity, params.fields, READ_EXAMPLE);

  // The SDK also declares skip/startDate/endDate/order; the server ignores
  // them for entity data, so they are not exposed and never sent.
  const amount = params.amount ?? DEFAULT_AMOUNT;
  const query: EntityDataQuery & { order_by?: string; fields?: string[] } = { amount };
  if (params.page !== undefined) {
    query.page = params.page;
  }
  if (params.index !== undefined) {
    query.index = params.index;
  }
  if (params.filter && Object.keys(params.filter).length > 0) {
    query.filter = params.filter;
  }
  if (params.fields && params.fields.length > 0) {
    query.fields = params.fields;
  }
  if (params.order_by) {
    // Bare direction on the wire: the server itself applies it to the
    // chosen index's last field (there is no field,direction form here).
    query.order_by = params.order_by;
  }

  const rows = await context.resources.entities.getEntityData(params.entity_id, query);

  const schemaFields = Object.keys(entity.schema ?? {}).filter((field) => field !== "id" && field !== "created_at");
  return renderList({
    items: rows as unknown as Record<string, unknown>[],
    conciseFields: ["id", ...schemaFields, "created_at"],
    selectedFields: params.fields,
    responseFormat: params.response_format,
    requestedAmount: amount,
    page: params.page,
    resourceLabel: "entity data rows",
    emptyHint: "Check the filter values against stored rows (get_entity shows the schema and indexes), or add rows with send_entity_data.",
  });
}

const readEntityDataConfigJSON: IToolConfig = {
  name: "read_entity_data",
  description: `Reads data rows stored in an entity (TagoIO schema-based database table), with paging and index-based filtering.

Entity querying is index-first: filters must use the fields of one index, as a left-to-right prefix of it, and sorting is only asc/desc on the chosen index's last field. Check the entity's indexes with get_entity and index the fields you filter on (update_entity_schema adds indexes). Without \`index\`, the server's built-in \`${DEFAULT_ENTITY_DATA_INDEX}\` (id, created_at) is used.

<example>
${READ_EXAMPLE}
</example>

Key limitations: filter keys outside the chosen index's prefix are rejected; amount is 1-10000 (default ${DEFAULT_AMOUNT}) with page-based pagination; there is no date-range or arbitrary order-by parameter.`,
  parameters: readEntityDataSchema,
  title: "Read Entity Data",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: readEntityDataTool,
};

export { readEntityDataConfigJSON };
