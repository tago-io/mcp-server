import type { NotificationCreate } from "@tago-io/sdk";
import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { pickDefined } from "../../../utils/pick-defined";
import { IToolConfig, ServerContext } from "../../types";
import { buttonsAutodisableSchema, buttonsEnabledSchema, notificationButtonsSchema, notificationIconSchema } from "../notification-schemas";

const SEND_EXAMPLE = '{ "run_user_id": "61f00000000000000c900001", "title": "Report ready", "message": "Your monthly report is available." }';

const SEND_WITH_BUTTON_EXAMPLE =
  '{ "run_user_id": "61f00000000000000c900001", "title": "High temperature", "message": "Freezer 2 is above 30 °C.", "buttons": [{ "id": "ack", "label": "Acknowledge", "triggers": [{ "analysis_id": "61f00000000000000000b001" }] }] }';

const sendRunUserNotificationBaseSchema = z.object({
  run_user_id: resourceIdSchema("run user ID"),
  title: z.string().min(1).describe("The notification title."),
  message: z.string().min(1).describe("The notification body text."),
  buttons: notificationButtonsSchema.optional(),
  buttons_enabled: buttonsEnabledSchema.optional(),
  buttons_autodisable: buttonsAutodisableSchema.optional(),
  icon: notificationIconSchema.optional(),
});

type SendRunUserNotificationSchema = z.infer<typeof sendRunUserNotificationBaseSchema>;

async function sendRunUserNotificationTool(context: ServerContext, params: SendRunUserNotificationSchema): Promise<string> {
  const { run_user_id: runUserID, ...notification } = params;
  const result = await context.resources.run.notificationCreate(runUserID, pickDefined(notification) as NotificationCreate);
  return `Notification sent to run user \`${runUserID}\` with ID \`${result.id}\`.`;
}

const sendRunUserNotificationConfigJSON: IToolConfig = {
  name: "send_run_user_notification",
  description: `Sends an in-app notification to one TagoRUN end user.

Use this when you want to notify a specific run user inside the TagoRUN portal, for example to tell them a report or task is ready. Resolve the run user ID with search_run_users first if you only have a name or email. Returns the new notification ID.

Optionally add up to four buttons. Each button runs an analysis (\`analysis_id\`, with an optional \`scope\`), calls a URL, or opens a TagoRUN page or external link (\`method: "REDIRECT"\`).

<example>
${SEND_EXAMPLE}
</example>

<example>
${SEND_WITH_BUTTON_EXAMPLE}
</example>`,
  parameters: sendRunUserNotificationBaseSchema.shape,
  title: "Send Run User Notification",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: sendRunUserNotificationTool,
};

export { sendRunUserNotificationConfigJSON };
