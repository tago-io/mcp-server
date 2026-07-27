import type { EntityCreateInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { tagsObjectModel } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { invalidParamMessage } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { ENTITY_FIELD_TYPES, assertValidEntityFieldName, encodePayloadDecoder, entityFieldDefinitionSchema } from "../sdk-boundary";

const CREATE_EXAMPLE = '{ "name": "Sensor Registry", "schema": { "temperature": { "type": "float", "required": true } }, "index": { "temp_idx": { "fields": ["temperature"] } } }';

const createEntityBaseSchema = z.object({
  name: z.string().min(1).max(100).describe("The name for the entity (1-100 characters)."),
  schema: z
    .record(entityFieldDefinitionSchema)
    .describe(
      `Field definitions keyed by field name. Field names must match ^[a-z_]+$; types are ${ENTITY_FIELD_TYPES.join(", ")}. The server creates id, created_at, and updated_at automatically; do not define them.`
    )
    .optional(),
  index: z
    .record(z.object({ fields: z.array(z.string().min(1)).min(1).max(5).describe("The schema fields the index covers, in order (1-5 fields).") }))
    .describe("Index definitions keyed by index name. Every index field must exist in the submitted `schema`. Indexes drive entity data querying (filters must prefix an index).")
    .optional(),
  tags: z.array(tagsObjectModel).describe("The tags for the entity. E.g: [{ key: 'entity_type', value: 'sensor' }]").optional(),
  payload_decoder: z
    .string()
    .describe("Payload decoder as plain JavaScript source, never base64; the encoding for the API happens internally. At most 64 KiB once encoded.")
    .optional(),
});

type CreateEntitySchema = z.infer<typeof createEntityBaseSchema>;

const createEntityCrossField = z.any().superRefine((value, ctx) => {
  const obj = (value ?? {}) as { schema?: Record<string, unknown>; index?: Record<string, { fields: string[] }> };
  const fieldNames = Object.keys(obj.schema ?? {});
  for (const fieldName of fieldNames) {
    try {
      assertValidEntityFieldName(fieldName, "schema", CREATE_EXAMPLE);
    } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : String(error) });
      return;
    }
  }
  for (const [indexName, definition] of Object.entries(obj.index ?? {})) {
    const missing = definition.fields.filter((field) => !fieldNames.includes(field));
    if (missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: invalidParamMessage("index", `index \`${indexName}\` references field(s) not present in the submitted schema: ${missing.join(", ")}`, CREATE_EXAMPLE),
      });
      return;
    }
  }
});

async function createEntityTool(context: ServerContext, params: CreateEntitySchema): Promise<string> {
  const encodedDecoder = params.payload_decoder === undefined ? undefined : encodePayloadDecoder(params.payload_decoder, CREATE_EXAMPLE);

  // The create route parses schema entries as bare {type, required}; the
  // action discriminator belongs only to the PUT /entity/:id/schema changeset
  // (the SDK create() JSDoc example showing action:"create" is misleading).
  const body: EntityCreateInfo = { name: params.name };
  if (params.schema) {
    body.schema = Object.fromEntries(Object.entries(params.schema).map(([fieldName, field]) => [fieldName, { type: field.type, required: field.required ?? false }]));
  }
  if (params.index) {
    body.index = Object.fromEntries(Object.entries(params.index).map(([indexName, definition]) => [indexName, { fields: definition.fields }]));
  }
  if (params.tags) {
    body.tags = params.tags;
  }
  if (encodedDecoder !== undefined) {
    body.payload_decoder = encodedDecoder;
  }

  try {
    const result = await context.resources.entities.create(body);
    return `Entity created with ID \`${result.id}\`. Add data rows with send_entity_data; change fields or indexes later with update_entity_schema.`;
  } catch (error) {
    // A reflected failure can echo the submitted decoder (as the plaintext
    // the caller sent or the base64 form actually transmitted) alongside the
    // request credential; all three are known secrets here.
    throw new Error(describeErrorSafely(error, [context.token, params.payload_decoder, encodedDecoder]));
  }
}

const createEntityConfigJSON: IToolConfig = {
  name: "create_entity",
  description: `Creates a new entity (TagoIO schema-based database table) in the account.

Use this when the user wants a new structured-data table with typed fields. Define fields under \`schema\` (names ^[a-z_]+$; types ${ENTITY_FIELD_TYPES.join(", ")}) and query indexes under \`index\`; entity data filtering requires an index, so index the fields you plan to filter on. The server adds id, created_at, and updated_at columns automatically; defining them is rejected. Send \`payload_decoder\` as plain JavaScript source; the base64 encoding for the API happens internally.

<example>
${CREATE_EXAMPLE}
</example>

Key limitations: field types cannot be changed after creation (only added, renamed, or deleted via update_entity_schema); each index covers 1-5 schema fields; the payload decoder source is capped at 64 KiB encoded and is never echoed back.`,
  parameters: createEntityBaseSchema.shape,
  title: "Create Entity",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: createEntityCrossField,
  tool: createEntityTool,
};

export { createEntityConfigJSON };
