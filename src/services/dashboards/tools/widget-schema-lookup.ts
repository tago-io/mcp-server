import { z } from "zod/v3";

import { IToolConfig, ServerContext } from "../../types";
import { getWidgetSchema, WIDGET_TYPES } from "../validation-adapter";

// Hard cap on the serialized schema response. The largest known schema is
// ~70 KB, so this guards against future package growth; it is never a
// silent-truncation point.
const MAX_SCHEMA_RESPONSE_BYTES = 128 * 1024;

function serializeWidgetSchema(schema: object): string {
  const serialized = JSON.stringify(schema);
  if (Buffer.byteLength(serialized, "utf8") > MAX_SCHEMA_RESPONSE_BYTES) {
    throw new Error(`Serialized widget schema exceeds the ${MAX_SCHEMA_RESPONSE_BYTES / 1024} KiB response cap. Report this; the schema cannot be returned truncated.`);
  }
  return serialized;
}

const widgetSchemaLookupBaseSchema = z.object({
  type: z.string().describe(`Widget type to fetch the schema for (one of ${WIDGET_TYPES.length} supported types, e.g. "gauge"). Omit to list all types.`).optional(),
  mode: z.enum(["create", "update"]).describe('Which schema to return: "create" (default) or "update".').optional(),
});

type WidgetSchemaLookupSchema = z.infer<typeof widgetSchemaLookupBaseSchema>;

async function widgetSchemaLookupTool(_context: ServerContext, params: WidgetSchemaLookupSchema): Promise<string> {
  if (params.type === undefined) {
    return [
      `Supported widget types (${WIDGET_TYPES.length}):`,
      ...WIDGET_TYPES.map((type) => `- ${type}`),
      "",
      'Call widget_schema_lookup with { "type": "<one of the above>" } (optionally "mode": "update") for the exact configuration schema.',
    ].join("\n");
  }

  const mode = params.mode ?? "create";
  const serialized = serializeWidgetSchema(getWidgetSchema(params.type, mode));
  const response = [
    `JSON Schema for the "${params.type}" widget (${mode} mode):`,
    "```json",
    serialized,
    "```",
    "",
    "Note: this schema describes the full merged widget configuration. The mutation inputs are compact objects: create_widget takes only the fields you set, and update_widget takes a PATCH with only the fields you change.",
  ].join("\n");
  // The cap governs the whole serialized response, not just the schema body.
  if (Buffer.byteLength(response, "utf8") > MAX_SCHEMA_RESPONSE_BYTES) {
    throw new Error(`Widget schema response exceeds the ${MAX_SCHEMA_RESPONSE_BYTES / 1024} KiB cap. Report this; the schema cannot be returned truncated.`);
  }
  return response;
}

const widgetSchemaLookupConfigJSON: IToolConfig = {
  name: "widget_schema_lookup",
  description: `Returns the official JSON Schema for a widget type, or lists the supported widget types when no type is given.

Use this before create_widget or update_widget to learn the exact configuration a widget type demands (required display fields, data shape, enums), or after a validation failure to repair the listed paths.

<example>
{ "type": "gauge" }
</example>`,
  parameters: widgetSchemaLookupBaseSchema.shape,
  title: "Widget Schema Lookup",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: widgetSchemaLookupTool,
};

export { MAX_SCHEMA_RESPONSE_BYTES, serializeWidgetSchema, widgetSchemaLookupConfigJSON };
