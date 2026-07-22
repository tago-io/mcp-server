import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";

const deleteActionBaseSchema = z.object({
  action_id: resourceIdSchema("action ID"),
});

type DeleteActionSchema = z.infer<typeof deleteActionBaseSchema>;

async function deleteActionTool(context: ServerContext, params: DeleteActionSchema): Promise<string> {
  await context.resources.actions.delete(params.action_id);
  return `Action \`${params.action_id}\` deleted.`;
}

const deleteActionConfigJSON: IToolConfig = {
  name: "delete_action",
  description: `Permanently deletes a TagoIO automation action by ID, stopping any future triggering.

Use this only when the user explicitly asks to remove an automation. Confirm the target with get_action or search_actions first if there is any ambiguity about which action is meant.

<example>
{ "action_id": "6299f0b1c72f2f00181d8b3c" }
</example>

Key limitations: deletion cannot be undone; the action's configuration is lost (fetch it with get_action beforehand if it may need to be recreated).`,
  parameters: deleteActionBaseSchema.shape,
  title: "Delete Action",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteActionTool,
};

export { deleteActionConfigJSON };
