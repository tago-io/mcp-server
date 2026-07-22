import type { EntityCreateInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { requireAtLeastOne } from "../../../utils/cross-field";
import { resourceIdSchema, tagsObjectModel } from "../../../utils/global-params.model";
import { pickDefined } from "../../../utils/pick-defined";
import { describeErrorSafely } from "../../../utils/safe-error";
import { IToolConfig, ServerContext } from "../../types";
import { encodePayloadDecoder } from "../sdk-boundary";

const UPDATE_EXAMPLE = '{ "entity_id": "61f0000000000000000e0001", "name": "Asset Registry" }';

const updateEntityBaseSchema = z.object({
  entity_id: resourceIdSchema("entity ID"),
  name: z.string().min(1).max(100).describe("The new name for the entity (1-100 characters).").optional(),
  tags: z.array(tagsObjectModel).describe("The new tags for the entity, replacing the current ones.").optional(),
  payload_decoder: z
    .string()
    .nullable()
    .describe(
      "New payload decoder as plain JavaScript source, never base64; the encoding for the API happens internally. At most 64 KiB once encoded. Send null to remove the decoder."
    )
    .optional(),
});

type UpdateEntitySchema = z.infer<typeof updateEntityBaseSchema>;

const updateEntityCrossField = requireAtLeastOne(
  ["name", "tags", "payload_decoder"],
  "entity_id",
  "at least one field to update (name, tags, or payload_decoder) must be provided alongside it",
  UPDATE_EXAMPLE
);

async function updateEntityTool(context: ServerContext, params: UpdateEntitySchema): Promise<string> {
  const encodedDecoder = typeof params.payload_decoder === "string" ? encodePayloadDecoder(params.payload_decoder, UPDATE_EXAMPLE) : params.payload_decoder;

  const changes: Partial<EntityCreateInfo> = pickDefined({ name: params.name, tags: params.tags, payload_decoder: encodedDecoder });

  try {
    await context.resources.entities.edit(params.entity_id, changes);
  } catch (error) {
    // A reflected failure can echo the submitted decoder (plaintext or the
    // base64 form actually transmitted) alongside the request credential.
    throw new Error(describeErrorSafely(error, [context.token, params.payload_decoder ?? undefined, encodedDecoder ?? undefined]));
  }
  // Controlled local confirmation: the SDK success text is server-provided
  // and may echo submitted values, so it never reaches the result.
  return `Entity \`${params.entity_id}\` updated.`;
}

const updateEntityConfigJSON: IToolConfig = {
  name: "update_entity",
  description: `Updates an existing entity (TagoIO schema-based database table) by ID. Only name, tags, and payload_decoder are server-editable; only the provided fields are changed, and \`tags\` replaces the current set entirely.

Use this to rename an entity, retag it, or change/remove its payload decoder. Fields and indexes are NOT changed here; use update_entity_schema for schema changes. Send \`payload_decoder\` as plain JavaScript source (encoded internally), or null to remove it.

<example>
${UPDATE_EXAMPLE}
</example>

Key limitations: at least one editable field must be provided; schema and index changes belong to update_entity_schema; data rows belong to send_entity_data/edit_entity_data; the decoder source is capped at 64 KiB encoded and is never echoed back.`,
  parameters: updateEntityBaseSchema.shape,
  title: "Update Entity",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: updateEntityCrossField,
  tool: updateEntityTool,
};

export { updateEntityConfigJSON };
