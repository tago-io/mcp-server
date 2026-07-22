import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { IToolConfig, ServerContext } from "../../types";
import { MAX_ENTITY_DATA_DELETE_IDS, extractEntityDataCount } from "../entity-data";

const DELETE_EXAMPLE = '{ "entity_id": "61f0000000000000000f0001", "ids": ["61f0000000000000000fd001"] }';

const deleteEntityDataSchema = {
  entity_id: resourceIdSchema("entity ID"),
  ids: z
    .array(z.string().min(1).describe("Row ID from read_entity_data."))
    .min(1, "At least one row ID is required")
    .max(
      MAX_ENTITY_DATA_DELETE_IDS,
      `The server deletes at most ${MAX_ENTITY_DATA_DELETE_IDS} rows per request; repeat the call for more rows, or use empty_entity_data to wipe the entity`
    )
    .describe(`IDs of the rows to delete (1-${MAX_ENTITY_DATA_DELETE_IDS} per request, a server cap).`),
};

type DeleteEntityDataParams = z.infer<z.ZodObject<typeof deleteEntityDataSchema>>;

async function deleteEntityDataTool(context: ServerContext, params: DeleteEntityDataParams): Promise<string> {
  try {
    const result = await context.resources.entities.deleteEntityData(params.entity_id, { ids: params.ids });
    const count = extractEntityDataCount(result, params.ids.length);
    return `${count} data row(s) deleted from entity \`${params.entity_id}\`.`;
  } catch (error) {
    throw new Error(describeErrorSafely(error, [context.token]));
  }
}

const deleteEntityDataConfigJSON: IToolConfig = {
  name: "delete_entity_data",
  description: `Permanently deletes specific data rows from an entity (TagoIO schema-based database table) by row ID.

Use only when the user explicitly asks to remove stored rows. Get the row IDs from read_entity_data first; there is no filter-based delete. To remove every row at once, use empty_entity_data instead.

<example>
${DELETE_EXAMPLE}
</example>

Key limitations: deletion cannot be undone; the server accepts at most ${MAX_ENTITY_DATA_DELETE_IDS} row IDs per request (repeat the call for more); already-deleted IDs are skipped, so the returned count can be lower than the IDs sent.`,
  parameters: deleteEntityDataSchema,
  title: "Delete Entity Data",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteEntityDataTool,
};

export { deleteEntityDataConfigJSON };
