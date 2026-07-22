import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";

const deleteRunUserNotificationBaseSchema = z.object({
  notification_id: resourceIdSchema("notification ID"),
});

type DeleteRunUserNotificationSchema = z.infer<typeof deleteRunUserNotificationBaseSchema>;

async function deleteRunUserNotificationTool(context: ServerContext, params: DeleteRunUserNotificationSchema): Promise<string> {
  await context.resources.run.notificationDelete(params.notification_id);
  return `Notification \`${params.notification_id}\` permanently deleted.`;
}

const deleteRunUserNotificationConfigJSON: IToolConfig = {
  name: "delete_run_user_notification",
  description: `Permanently deletes a TagoRUN notification by its notification ID.

Use this only when the user explicitly asks to remove a notification. The notification ID comes from read_run_user_notifications or the send_run_user_notification result.

<example>
{ "notification_id": "61f00000000000000ca00001" }
</example>

Key limitations: deletion cannot be undone; the notification ID is the notification's own ID, not the run user's ID.`,
  parameters: deleteRunUserNotificationBaseSchema.shape,
  title: "Delete Run User Notification",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteRunUserNotificationTool,
};

export { deleteRunUserNotificationConfigJSON };
