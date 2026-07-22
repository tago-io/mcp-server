import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { invalidParamMessage } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { MAX_ENTITY_DATA_ROWS, assertEntityDataRowBytes, extractEntityDataCount } from "../entity-data";

const EDIT_EXAMPLE = '{ "entity_id": "61f0000000000000000f0001", "data": [{ "id": "61f0000000000000000fd001", "temperature": 26 }] }';

const editRowSchema = z
  .object({
    id: z.string().min(1).describe("ID of the existing row to update (from read_entity_data)."),
  })
  .catchall(z.unknown());

const editEntityDataSchema = {
  entity_id: resourceIdSchema("entity ID"),
  data: z
    .array(editRowSchema)
    .min(1, "At least one data edit is required")
    .max(MAX_ENTITY_DATA_ROWS, `At most ${MAX_ENTITY_DATA_ROWS} rows per request`)
    .describe("Edits to apply. Each entry targets one row by `id` and carries only the fields to change."),
};

type EditEntityDataParams = z.infer<z.ZodObject<typeof editEntityDataSchema>>;

const editEntityDataCrossField = z.any().superRefine((value, ctx) => {
  const data = ((value ?? {}) as { data?: Record<string, unknown>[] }).data ?? [];
  for (const [position, row] of data.entries()) {
    if (Object.keys(row).filter((key) => key !== "id").length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: invalidParamMessage("data", `row at position ${position} carries only an id; include at least one field to change`, EDIT_EXAMPLE),
      });
      return;
    }
  }
});

async function editEntityDataTool(context: ServerContext, params: EditEntityDataParams): Promise<string> {
  assertEntityDataRowBytes(params.data, EDIT_EXAMPLE);

  try {
    const result = await context.resources.entities.editEntityData(params.entity_id, params.data as never);
    const count = extractEntityDataCount(result, params.data.length);
    return `${count} data row(s) updated in entity \`${params.entity_id}\`.`;
  } catch (error) {
    throw new Error(describeErrorSafely(error, [context.token]));
  }
}

const editEntityDataConfigJSON: IToolConfig = {
  name: "edit_entity_data",
  description: `Updates existing data rows in an entity (TagoIO schema-based database table) in place. This is a partial update: only the fields present in each entry change, but their previous values are overwritten and lost.

Use to correct stored rows. Each entry needs the row \`id\` (from read_entity_data) plus at least one schema field to change.

<example>
${EDIT_EXAMPLE}
</example>

Key limitations: at most ${MAX_ENTITY_DATA_ROWS} rows per request, each under 1 MiB serialized; overwritten values cannot be recovered; new values are type-checked against the entity schema by the server.`,
  parameters: editEntityDataSchema,
  title: "Edit Entity Data",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  crossFieldSchema: editEntityDataCrossField,
  tool: editEntityDataTool,
};

export { editEntityDataConfigJSON };
