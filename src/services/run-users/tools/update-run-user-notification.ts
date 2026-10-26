import type { NotificationCreate } from "@tago-io/sdk";
import { z } from "zod/v3";

import { requireAtLeastOne } from "../../../utils/cross-field";
import { resourceIdSchema } from "../../../utils/global-params.model";
import { pickDefined } from "../../../utils/pick-defined";
import { IToolConfig, ServerContext } from "../../types";
import { buttonsAutodisableSchema, buttonsEnabledSchema, notificationButtonsSchema, notificationIconSchema } from "../notification-schemas";

const UPDATE_EXAMPLE = '{ "notification_id": "61f00000000000000ca00001", "title": "Report ready (updated)" }';

const updateRunUserNotificationBaseSchema = z.object({
  notification_id: resourceIdSchema("notification ID"),
  title: z.string().min(1).describe("The new notification title.").optional(),
  message: z.string().min(1).describe("The new notification body text.").optional(),
  buttons: notificationButtonsSchema.describe("The new action buttons, replacing the current ones (at most 4). Send [] to remove them all.").optional(),
  buttons_enabled: buttonsEnabledSchema.optional(),
  buttons_autodisable: buttonsAutodisableSchema.optional(),
  icon: notificationIconSchema.optional(),
});

type UpdateRunUserNotificationSchema = z.infer<typeof updateRunUserNotificationBaseSchema>;

const updateRunUserNotificationCrossField = requireAtLeastOne(
  ["title", "message", "buttons", "buttons_enabled", "buttons_autodisable", "icon"],
  "notification_id",
  "at least one field to update (title, message, buttons, buttons_enabled, buttons_autodisable, or icon) must be provided alongside it",
  UPDATE_EXAMPLE
);

async function updateRunUserNotificationTool(context: ServerContext, params: UpdateRunUserNotificationSchema): Promise<string> {
  const { notification_id: _notificationID, ...fields } = params;
  const changes = pickDefined(fields) as Partial<NotificationCreate>;

  await context.resources.run.notificationEdit(params.notification_id, changes);
  return `Notification \`${params.notification_id}\` updated.`;
}

const updateRunUserNotificationConfigJSON: IToolConfig = {
  name: "update_run_user_notification",
  description: `Updates an existing TagoRUN notification by its notification ID. Only the provided fields (title, message, buttons, buttons_enabled, buttons_autodisable, icon) change; \`buttons\` replaces the whole set.

Use this to edit a notification you previously sent, for example to fix its title or message. The notification ID comes from read_run_user_notifications or from the create result of send_run_user_notification.

<example>
${UPDATE_EXAMPLE}
</example>

Key limitations: at least one editable field must be provided; the notification ID is the notification's own ID, not the run user's ID.`,
  parameters: updateRunUserNotificationBaseSchema.shape,
  title: "Update Run User Notification",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: updateRunUserNotificationCrossField,
  tool: updateRunUserNotificationTool,
};

export { updateRunUserNotificationConfigJSON };
