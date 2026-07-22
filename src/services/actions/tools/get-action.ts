import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const getActionBaseSchema = z.object({
  action_id: resourceIdSchema("action ID"),
  response_format: responseFormatSchema,
});

type GetActionSchema = z.infer<typeof getActionBaseSchema>;

async function getActionTool(context: ServerContext, params: GetActionSchema): Promise<string> {
  const action = await context.resources.actions.info(params.action_id);
  return renderItem(action as unknown as Record<string, unknown>, ["id", "name", "type", "active", "tags", "last_triggered", "action", "trigger"], params.response_format);
}

const getActionConfigJSON: IToolConfig = {
  name: "get_action",
  description: `Retrieves a single TagoIO automation action by ID, including its trigger configuration and what it executes when triggered.

Use this when you already have an action ID (for example from search_actions) and need to inspect or verify its configuration before updating or deleting it.

<example>
{ "action_id": "6299f0b1c72f2f00181d8b3c" }
</example>

Key limitations: returns configuration only; it does not report execution history or whether the action ran successfully (last_triggered is the only execution signal).`,
  parameters: getActionBaseSchema.shape,
  title: "Get Action",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getActionTool,
};

export { getActionConfigJSON };
