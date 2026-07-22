import type { EntitySchema } from "@tago-io/sdk";
import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { invalidParamMessage } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { ENTITY_FIELD_TYPES, assertValidEntityFieldName } from "../sdk-boundary";

const SCHEMA_EXAMPLE =
  '{ "entity_id": "61f0000000000000000e0001", "fields": { "humidity": { "action": "create", "type": "float" }, "temp": { "action": "rename", "new_name": "temperature" } } }';

const fieldActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    type: z.enum(ENTITY_FIELD_TYPES).describe(`Field type. One of: ${ENTITY_FIELD_TYPES.join(", ")}. Immutable once created.`),
    required: z.boolean().describe("Whether every data row must carry this field. Defaults to false.").optional(),
  }),
  z.object({
    action: z.literal("rename"),
    new_name: z.string().describe("The new field name (^[a-z_]+$). The field's type and stored data are preserved."),
  }),
  z.object({
    action: z.literal("update"),
    required: z.boolean().describe("The new required flag. Only nullability can be updated; field types are immutable."),
  }),
  z.object({
    action: z.literal("delete"),
  }),
]);

const indexActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    fields: z.array(z.string().min(1)).min(1).max(5).describe("The schema fields the index covers, in order (1-5 fields)."),
  }),
  z.object({
    action: z.literal("delete"),
  }),
]);

const updateEntitySchemaBaseSchema = z.object({
  entity_id: resourceIdSchema("entity ID"),
  fields: z
    .record(fieldActionSchema)
    .describe(
      "Field changes keyed by field name: create {type, required?}, rename {new_name}, update {required} (nullability only; types are immutable), or delete (drops the column AND its stored data)."
    )
    .optional(),
  indexes: z.record(indexActionSchema).describe("Index changes keyed by index name: create {fields} or delete.").optional(),
});

type UpdateEntitySchemaParams = z.infer<typeof updateEntitySchemaBaseSchema>;

/**
 * Detects the server's refusal to add a required column to an entity that
 * already holds data, so the tool can steer to the documented workaround.
 * Message matching is best-effort against the known failure wording.
 */
function isRequiredOnPopulatedFailure(message: string): boolean {
  return /required/i.test(message) && /(existing data|populated|not empty|has data|contains data)/i.test(message);
}

function describeFieldAction(fieldName: string, change: NonNullable<UpdateEntitySchemaParams["fields"]>[string]): string {
  switch (change.action) {
    case "create":
      return `created field \`${fieldName}\` (${change.type}${change.required ? ", required" : ""})`;
    case "rename":
      return `renamed field \`${fieldName}\` to \`${change.new_name}\``;
    case "update":
      return `set field \`${fieldName}\` required: ${change.required}`;
    case "delete":
      return `deleted field \`${fieldName}\` and its stored data`;
  }
}

const updateEntitySchemaCrossField = z.any().superRefine((value, ctx) => {
  const obj = (value ?? {}) as { fields?: Record<string, { action: string; new_name?: string }>; indexes?: Record<string, unknown> };
  const fieldEntries = Object.entries(obj.fields ?? {});
  const indexEntries = Object.entries(obj.indexes ?? {});
  if (fieldEntries.length === 0 && indexEntries.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: invalidParamMessage("entity_id", "at least one field or index action must be provided alongside it", SCHEMA_EXAMPLE) });
    return;
  }
  for (const [fieldName, change] of fieldEntries) {
    try {
      assertValidEntityFieldName(fieldName, "fields", SCHEMA_EXAMPLE);
      if (change.action === "rename" && typeof change.new_name === "string") {
        assertValidEntityFieldName(change.new_name, "fields", SCHEMA_EXAMPLE);
      }
    } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : String(error) });
      return;
    }
  }
});

async function updateEntitySchemaTool(context: ServerContext, params: UpdateEntitySchemaParams): Promise<string> {
  const fieldEntries = Object.entries(params.fields ?? {});
  const indexEntries = Object.entries(params.indexes ?? {});

  const confirmations: string[] = [];
  for (const [fieldName, change] of fieldEntries) {
    confirmations.push(describeFieldAction(fieldName, change));
  }
  for (const [indexName, change] of indexEntries) {
    confirmations.push(change.action === "create" ? `created index \`${indexName}\` on (${change.fields.join(", ")})` : `deleted index \`${indexName}\``);
  }

  const body: { schema?: EntitySchema; index?: Record<string, { action: "create"; fields: string[] } | { action: "delete" }> } = {};
  if (fieldEntries.length > 0) {
    body.schema = Object.fromEntries(
      fieldEntries.map(([fieldName, change]) => [fieldName, change.action === "create" ? { ...change, required: change.required ?? false } : change])
    );
  }
  if (indexEntries.length > 0) {
    body.index = Object.fromEntries(indexEntries);
  }

  try {
    await context.resources.entities.editSchemaIndex(params.entity_id, body);
  } catch (error) {
    const safe = describeErrorSafely(error, [context.token]);
    if (isRequiredOnPopulatedFailure(safe)) {
      throw new Error(
        `The server cannot add a required field to an entity that already has data rows. Workaround: create the field as optional ({"action": "create", "type": ..., "required": false}), backfill a value into every existing row (send_entity_data upserts on id), then set it to required with a follow-up update_entity_schema {"action": "update", "required": true}. Server detail: ${safe}`
      );
    }
    throw new Error(safe);
  }

  return `Entity \`${params.entity_id}\` schema updated: ${confirmations.join("; ")}.`;
}

const updateEntitySchemaConfigJSON: IToolConfig = {
  name: "update_entity_schema",
  description: `Changes the field and index structure of an existing entity (TagoIO schema-based database table): a changeset of field actions (create, rename, update, delete) and index actions (create, delete) applied in one call.

Use this to evolve an entity after creation: add fields, rename them, toggle whether they are required, drop them, or manage query indexes. Field TYPES are immutable; there is no update path for a field's type, so to change one, create a new field and migrate the data. Field names match ^[a-z_]+$; id, created_at, and updated_at are reserved. Deleting a field permanently drops the column and every value stored in it.

<example>
${SCHEMA_EXAMPLE}
</example>

Key limitations: only the required flag of an existing field can be updated, never its type; adding a required field to an entity that already has data is refused by the server (create it optional, backfill, then set required); deleting fields or indexes cannot be undone. Entity name/tags/decoder changes belong to update_entity.`,
  parameters: updateEntitySchemaBaseSchema.shape,
  title: "Update Entity Schema",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  mutationClass: "destructive",
  crossFieldSchema: updateEntitySchemaCrossField,
  tool: updateEntitySchemaTool,
};

export { updateEntitySchemaConfigJSON };
