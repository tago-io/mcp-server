import type { ActionCreateInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { resourceIdSchema, tagsObjectModel } from "../../../utils/global-params.model";
import { pickDefined } from "../../../utils/pick-defined";
import { invalidParamMessage } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import type { ActionTypeValue, TriggerValue } from "./create-action";
import { actionParamsSchema, actionTypeSchema, triggerSchema, validateTriggerMatchesType } from "./create-action";

const TRIGGER_REPLACEMENT_EXAMPLE = '{ "action_id": "6299f0b1c72f2f00181d8b3c", "type": "interval", "trigger": [{ "interval": "5 minutes" }] }';

const updateActionBaseSchema = z.object({
  action_id: resourceIdSchema("action ID"),
  name: z.string().min(1).describe("The new name for the action.").optional(),
  active: z.boolean().describe("Enable or disable the action.").optional(),
  type: actionTypeSchema.optional(),
  action: actionParamsSchema.optional(),
  trigger: z.array(triggerSchema).describe("The new trigger configuration, replacing the current one. Must be sent together with `type`.").optional(),
  tags: z.array(tagsObjectModel).describe("The new tags for the action, replacing the current ones.").optional(),
  description: z.string().describe("The new description for the action.").optional(),
  trigger_when_unlock: z.boolean().describe("Trigger the action when the unlock condition is met. Only available for actions of type condition or condition_geofence.").optional(),
});

type UpdateActionSchema = z.infer<typeof updateActionBaseSchema>;

const UPDATE_EDITABLE_KEYS = ["name", "active", "type", "action", "trigger", "tags", "description", "trigger_when_unlock"] as const;

/**
 * Cross-field contract for update_action: at least one editable field, and,
 * because the server does not merge a new trigger against the stored type, a
 * lone `type` or `trigger` is rejected so the two are always replaced together.
 */
const updateActionCrossField = z.any().superRefine((value, ctx) => {
  const obj = (value ?? {}) as Record<string, unknown>;
  if (!UPDATE_EDITABLE_KEYS.some((key) => obj[key] !== undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: invalidParamMessage("action_id", "at least one field to update must be provided alongside it", '{ "action_id": "6299f0b1c72f2f00181d8b3c", "name": "New name" }'),
    });
    return;
  }

  const type = obj.type as ActionTypeValue | undefined;
  const trigger = obj.trigger as TriggerValue[] | undefined;
  if (type === undefined && trigger === undefined) {
    return;
  }
  if (type === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: invalidParamMessage("type", "required when `trigger` is provided; send the complete replacement (type + matching trigger) together", TRIGGER_REPLACEMENT_EXAMPLE),
    });
    return;
  }
  if (type !== "mqtt_topic" && trigger === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: invalidParamMessage(
        "trigger",
        'required when `type` is provided (except "mqtt_topic"); send the complete replacement (type + matching trigger) together',
        TRIGGER_REPLACEMENT_EXAMPLE
      ),
    });
    return;
  }
  try {
    validateTriggerMatchesType(type, trigger);
  } catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : String(error) });
  }
});

async function updateActionTool(context: ServerContext, params: UpdateActionSchema): Promise<string> {
  const { action_id, name, active, type, action, trigger, tags, description, trigger_when_unlock } = params;

  const changes: Partial<ActionCreateInfo> = pickDefined({ name, active, type, action, trigger, tags, description, trigger_when_unlock });

  await context.resources.actions.edit(action_id, changes);
  return `Action \`${action_id}\` updated.`;
}

const updateActionConfigJSON: IToolConfig = {
  name: "update_action",
  description: `Updates an existing TagoIO automation action by ID. Only the provided fields are changed; \`action\` and \`trigger\` replace the current configuration entirely when provided.

Use this when the user wants to rename, retag, enable/disable, or reconfigure an existing action, for example changing its trigger conditions or what it executes. Look up the action with search_actions or get_action first if you only have its name.

<example>
{
  "action_id": "6299f0b1c72f2f00181d8b3c",
  "name": "Notify on high temperature",
  "description": "Renamed for clarity"
}
</example>

Key limitations: \`action\` and \`trigger\` are not merged with the existing configuration; send the complete new value. When reconfiguring the trigger, \`type\` and a matching \`trigger\` must be sent together (except type "mqtt_topic", which takes no trigger); for action types that use Secrets, the Secret ID must be provided by the user.`,
  parameters: updateActionBaseSchema.shape,
  title: "Update Action",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: updateActionCrossField,
  tool: updateActionTool,
};

export { updateActionConfigJSON };
