import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";

const SEND_EXAMPLE = '{ "run_user_id": "61f00000000000000c900001", "title": "Report ready", "message": "Your monthly report is available." }';

const sendRunUserNotificationBaseSchema = z.object({
  run_user_id: resourceIdSchema("run user ID"),
  title: z.string().min(1).describe("The notification title."),
  message: z.string().min(1).describe("The notification body text."),
});

type SendRunUserNotificationSchema = z.infer<typeof sendRunUserNotificationBaseSchema>;

async function sendRunUserNotificationTool(context: ServerContext, params: SendRunUserNotificationSchema): Promise<string> {
  const result = await context.resources.run.notificationCreate(params.run_user_id, { title: params.title, message: params.message });
  return `Notification sent to run user \`${params.run_user_id}\` with ID \`${result.id}\`.`;
}

const sendRunUserNotificationConfigJSON: IToolConfig = {
  name: "send_run_user_notification",
  description: `Sends an in-app notification to one TagoRUN end user.

Use this when you want to notify a specific run user inside the TagoRUN portal, for example to tell them a report or task is ready. Resolve the run user ID with search_run_users first if you only have a name or email. Returns the new notification ID.

<example>
${SEND_EXAMPLE}
</example>`,
  parameters: sendRunUserNotificationBaseSchema.shape,
  title: "Send Run User Notification",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: sendRunUserNotificationTool,
};

export { sendRunUserNotificationConfigJSON };
