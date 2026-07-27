import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { IToolConfig, ServerContext } from "../../types";
import { MAX_ENTITY_DATA_ROWS, assertEntityDataRowBytes, extractEntityDataCount } from "../entity-data";

const SEND_EXAMPLE = '{ "entity_id": "61f0000000000000000f0001", "data": [{ "temperature": 25.5, "unit": "C" }] }';

const sendRowSchema = z
  .object({
    id: z.string().describe("Optional row ID. The server UPSERTS on id: re-sending an existing id overwrites that row.").optional(),
  })
  .catchall(z.unknown());

const sendEntityDataSchema = {
  entity_id: resourceIdSchema("entity ID"),
  data: z
    .array(sendRowSchema)
    .min(1, "At least one data row is required")
    .max(MAX_ENTITY_DATA_ROWS, `At most ${MAX_ENTITY_DATA_ROWS} rows per request`)
    .describe("Rows to store. Each row is an object of schema fields (see get_entity); values are validated against the field types by the server."),
};

type SendEntityDataParams = z.infer<z.ZodObject<typeof sendEntityDataSchema>>;

async function sendEntityDataTool(context: ServerContext, params: SendEntityDataParams): Promise<string> {
  assertEntityDataRowBytes(params.data, SEND_EXAMPLE);

  try {
    const result = await context.resources.entities.sendEntityData(params.entity_id, params.data);
    const count = extractEntityDataCount(result, params.data.length);
    return `${count} data row(s) stored in entity \`${params.entity_id}\`.`;
  } catch (error) {
    throw new Error(describeErrorSafely(error, [context.token]));
  }
}

const sendEntityDataConfigJSON: IToolConfig = {
  name: "send_entity_data",
  description: `Stores new data rows in an entity (TagoIO schema-based database table).

Rows are objects of the entity's schema fields; check the schema with get_entity first. Include \`id\` only to UPSERT: sending a row with an existing id overwrites that row instead of inserting a new one. Field values are type-checked by the server (string ≤100 chars, text ≤10k, json <100 KiB, int/float within ±2147483647, timestamp ISO 8601).

<example>
${SEND_EXAMPLE}
</example>

Key limitations: at most ${MAX_ENTITY_DATA_ROWS} rows per request, each under 1 MiB serialized; fields not in the schema are rejected by the server; unindexed fields cannot be filtered on later; index them via update_entity_schema.`,
  parameters: sendEntityDataSchema,
  title: "Send Entity Data",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: sendEntityDataTool,
};

export { sendEntityDataConfigJSON };
