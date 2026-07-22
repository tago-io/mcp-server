import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { IToolConfig, ServerContext } from "../../types";

const EMPTY_EXAMPLE = '{ "entity_id": "61f0000000000000000f0001" }';

const emptyEntityDataSchema = {
  entity_id: resourceIdSchema("entity ID"),
};

type EmptyEntityDataParams = z.infer<z.ZodObject<typeof emptyEntityDataSchema>>;

async function emptyEntityDataTool(context: ServerContext, params: EmptyEntityDataParams): Promise<string> {
  try {
    await context.resources.entities.emptyEntityData(params.entity_id);
  } catch (error) {
    throw new Error(describeErrorSafely(error, [context.token]));
  }
  return `All data rows in entity \`${params.entity_id}\` were permanently removed. The entity itself, its schema, and its indexes were kept.`;
}

const emptyEntityDataConfigJSON: IToolConfig = {
  name: "empty_entity_data",
  description: `Permanently removes ALL data rows from an entity (TagoIO schema-based database table). The entity itself, its schema, and its indexes are kept; only the stored rows are wiped, and they cannot be recovered.

Use only when the user explicitly asks to wipe or empty an entity's data. This is the bulk cleanup path: delete_entity_data removes at most 10 rows per request. To delete the entity itself, use delete_entity.

<example>
${EMPTY_EXAMPLE}
</example>

Key limitations: irreversible, every stored row is lost; there is no partial or filtered variant of this operation.`,
  parameters: emptyEntityDataSchema,
  title: "Empty Entity Data",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: emptyEntityDataTool,
};

export { emptyEntityDataConfigJSON };
