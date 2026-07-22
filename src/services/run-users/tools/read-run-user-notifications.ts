import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const readRunUserNotificationsSchema = {
  run_user_id: resourceIdSchema("run user ID"),
  response_format: responseFormatSchema,
};

type ReadRunUserNotificationsParams = z.infer<z.ZodObject<typeof readRunUserNotificationsSchema>>;

async function readRunUserNotificationsTool(context: ServerContext, params: ReadRunUserNotificationsParams): Promise<string> {
  const notifications = (await context.resources.run.notificationList(params.run_user_id)) as unknown as Record<string, unknown>[];
  return renderList({
    items: notifications,
    conciseFields: ["id", "title", "message", "read"],
    responseFormat: params.response_format,
    requestedAmount: notifications.length,
    resourceLabel: "notifications",
    emptyHint: "This run user has no notifications. Send one with send_run_user_notification.",
  });
}

const readRunUserNotificationsConfigJSON: IToolConfig = {
  name: "read_run_user_notifications",
  description: `Lists the in-app notifications for one TagoRUN end user, with their read state.

Use this when you need to see the notifications a run user has received, for example to check whether a notification was delivered or read. Resolve the run user ID with search_run_users first if you only have a name or email.

<example>
{ "run_user_id": "61f00000000000000c900001" }
</example>`,
  parameters: readRunUserNotificationsSchema,
  title: "Read Run User Notifications",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: readRunUserNotificationsTool,
};

export { readRunUserNotificationsConfigJSON };
