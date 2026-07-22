import { z } from "zod/v3";

import { invalidParamError } from "../../utils/tool-errors";

/**
 * Server-side entity field types. The SDK's EntityFieldType also declares
 * "boolean" (and the auto-created "uuid"), but the server accepts neither as
 * a user-defined field type; the server contract wins over the SDK types.
 */
const ENTITY_FIELD_TYPES = ["string", "text", "int", "float", "json", "timestamp"] as const;

/** Columns the server auto-creates on every entity; never user-definable. */
const RESERVED_ENTITY_FIELDS = ["id", "created_at", "updated_at"] as const;

const ENTITY_FIELD_NAME_PATTERN = /^[a-z_]+$/;

/** Wire cap for the payload decoder: 64 KiB of base64-encoded source. */
const MAX_PAYLOAD_DECODER_ENCODED_BYTES = 64 * 1024;

const entityFieldDefinitionSchema = z.object({
  type: z.enum(ENTITY_FIELD_TYPES).describe(`Field type. One of: ${ENTITY_FIELD_TYPES.join(", ")}.`),
  required: z.boolean().describe("Whether every data row must carry this field. Defaults to false.").optional(),
});

/**
 * Rejects reserved and malformed schema field names before any SDK traffic.
 * `param` names the tool parameter the field name arrived in.
 */
function assertValidEntityFieldName(fieldName: string, param: string, example: string): void {
  if ((RESERVED_ENTITY_FIELDS as readonly string[]).includes(fieldName)) {
    throw invalidParamError(param, `field name \`${fieldName}\` is reserved; the server creates \`${RESERVED_ENTITY_FIELDS.join("`, `")}\` automatically on every entity`, example);
  }
  if (!ENTITY_FIELD_NAME_PATTERN.test(fieldName)) {
    throw invalidParamError(param, `field name \`${fieldName}\` is invalid; field names must match ^[a-z_]+$ (lowercase letters and underscores only)`, example);
  }
}

function encodePayloadDecoder(source: string, example: string): string {
  const encoded = Buffer.from(source, "utf8").toString("base64");
  if (encoded.length > MAX_PAYLOAD_DECODER_ENCODED_BYTES) {
    throw invalidParamError(
      "payload_decoder",
      `must be at most ${MAX_PAYLOAD_DECODER_ENCODED_BYTES} bytes once base64-encoded (received ${encoded.length} bytes encoded)`,
      example
    );
  }
  return encoded;
}

export {
  assertValidEntityFieldName,
  ENTITY_FIELD_NAME_PATTERN,
  ENTITY_FIELD_TYPES,
  MAX_PAYLOAD_DECODER_ENCODED_BYTES,
  RESERVED_ENTITY_FIELDS,
  encodePayloadDecoder,
  entityFieldDefinitionSchema,
};
