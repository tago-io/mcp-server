import { invalidParamError } from "../../utils/tool-errors";
import { RESERVED_ENTITY_FIELDS } from "./sdk-boundary";

/**
 * Server-created default index present on every entity. Entity info does not
 * list it, so it is merged into the queryable index set locally.
 */
const DEFAULT_ENTITY_DATA_INDEX = "id_created_at_idx";
const DEFAULT_ENTITY_DATA_INDEX_FIELDS = ["id", "created_at"] as const;

/** Server caps for entity-data mutations (the SDK types are unbounded). */
const MAX_ENTITY_DATA_ROWS = 100;
const MAX_ENTITY_DATA_ROW_BYTES = 1024 * 1024;
const MAX_ENTITY_DATA_DELETE_IDS = 10;

interface EntityIndexShape {
  schema?: Record<string, unknown>;
  index?: Record<string, { fields?: string[] }>;
}

function resolveEntityDataIndexes(entity: EntityIndexShape): Record<string, string[]> {
  const indexes: Record<string, string[]> = { [DEFAULT_ENTITY_DATA_INDEX]: [...DEFAULT_ENTITY_DATA_INDEX_FIELDS] };
  for (const [name, definition] of Object.entries(entity.index ?? {})) {
    if (Array.isArray(definition?.fields) && definition.fields.length > 0) {
      indexes[name] = definition.fields;
    }
  }
  return indexes;
}

function describeEntityDataIndexes(indexes: Record<string, string[]>): string {
  return Object.entries(indexes)
    .map(([name, fields]) => `${name} (${fields.join(", ")})`)
    .join("; ");
}

/**
 * Validates the chosen index and filter against the prefetched entity:
 * the index must exist and the filter keys must form a left-to-right prefix
 * of its fields (skipping an intermediate field is invalid). Returns the
 * chosen index's fields so the caller can derive the order-by field.
 */
function validateEntityDataQueryTarget(entity: EntityIndexShape, indexName: string | undefined, filter: Record<string, string> | undefined, example: string): string[] {
  const indexes = resolveEntityDataIndexes(entity);
  const chosenIndex = indexName ?? DEFAULT_ENTITY_DATA_INDEX;
  const indexFields = indexes[chosenIndex];
  if (!indexFields) {
    throw invalidParamError("index", `index \`${chosenIndex}\` does not exist on this entity. Available indexes: ${describeEntityDataIndexes(indexes)}`, example);
  }

  const filterKeys = Object.keys(filter ?? {});
  if (filterKeys.length > 0) {
    const nonIndexed = filterKeys.filter((key) => !indexFields.includes(key));
    if (nonIndexed.length > 0) {
      throw invalidParamError(
        "filter",
        `field(s) ${nonIndexed.map((key) => `\`${key}\``).join(", ")} are not covered by index \`${chosenIndex}\` (fields in order: ${indexFields.join(", ")}). Filter keys must form a left-to-right prefix of a chosen index. Available indexes: ${describeEntityDataIndexes(indexes)}`,
        example
      );
    }
    const prefix = indexFields.slice(0, filterKeys.length);
    const skipped = prefix.filter((field) => !filterKeys.includes(field));
    if (skipped.length > 0) {
      throw invalidParamError(
        "filter",
        `filter keys must form a left-to-right prefix of index \`${chosenIndex}\` (fields in order: ${indexFields.join(", ")}); field(s) ${skipped.map((field) => `\`${field}\``).join(", ")} were skipped`,
        example
      );
    }
  }

  return indexFields;
}

function validateEntityDataFields(entity: EntityIndexShape, fields: string[] | undefined, example: string): void {
  if (!fields || fields.length === 0) {
    return;
  }
  const schemaFields = Object.keys(entity.schema ?? {});
  const known = new Set<string>([...RESERVED_ENTITY_FIELDS, ...schemaFields]);
  const unknown = fields.filter((field) => !known.has(field));
  if (unknown.length > 0) {
    throw invalidParamError(
      "fields",
      `field(s) ${unknown.map((field) => `\`${field}\``).join(", ")} are not in the entity schema. Available fields: ${[...known].join(", ")}`,
      example
    );
  }
}

/**
 * Enforces the server's per-row wire cap (<1 MiB serialized) before any SDK
 * traffic. Structural cap only; per-type value validation is the server's.
 */
function assertEntityDataRowBytes(rows: Array<Record<string, unknown>>, example: string): void {
  for (const [position, row] of rows.entries()) {
    const bytes = Buffer.byteLength(JSON.stringify(row), "utf8");
    if (bytes >= MAX_ENTITY_DATA_ROW_BYTES) {
      throw invalidParamError("data", `row at position ${position} serializes to ${bytes} bytes; each row must be under ${MAX_ENTITY_DATA_ROW_BYTES} bytes (1 MiB)`, example);
    }
  }
}

/**
 * Extracts the affected-row count from a server acknowledgment like
 * "3 item(s) updated". The count is contract data (insert/update/delete
 * counts); the surrounding SDK text never reaches tool results.
 */
function extractEntityDataCount(result: unknown, fallback: number): number {
  if (typeof result === "string") {
    const match = result.match(/^(\d+)\b/);
    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }
  return fallback;
}

export {
  DEFAULT_ENTITY_DATA_INDEX,
  MAX_ENTITY_DATA_DELETE_IDS,
  MAX_ENTITY_DATA_ROW_BYTES,
  MAX_ENTITY_DATA_ROWS,
  assertEntityDataRowBytes,
  describeEntityDataIndexes,
  extractEntityDataCount,
  resolveEntityDataIndexes,
  validateEntityDataFields,
  validateEntityDataQueryTarget,
};
