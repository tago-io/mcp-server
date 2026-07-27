import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";

const deleteEntityBaseSchema = z.object({
  entity_id: resourceIdSchema("entity ID"),
});

type DeleteEntitySchema = z.infer<typeof deleteEntityBaseSchema>;

async function deleteEntityTool(context: ServerContext, params: DeleteEntitySchema): Promise<string> {
  await context.resources.entities.delete(params.entity_id);
  return `Entity \`${params.entity_id}\` permanently deleted, including every data row stored in it.`;
}

const deleteEntityConfigJSON: IToolConfig = {
  name: "delete_entity",
  description: `Permanently deletes an entity (TagoIO schema-based database table) by ID. The entity, its schema, its indexes, and ALL data rows stored in it are permanently removed and cannot be recovered.

Use this only when the user explicitly asks to remove an entity. Confirm the target with get_entity or search_entities first if there is any ambiguity about which entity is meant.

<example>
{ "entity_id": "61f0000000000000000e0001" }
</example>

Key limitations: deletion cannot be undone; every data row dies with the entity; anything referencing the entity (analyses, dashboards) stops working.`,
  parameters: deleteEntityBaseSchema.shape,
  title: "Delete Entity",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteEntityTool,
};

export { deleteEntityConfigJSON };
