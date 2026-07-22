import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const getRunUserSchema = {
  run_user_id: resourceIdSchema("run user ID"),
  response_format: responseFormatSchema,
};

type GetRunUserParams = z.infer<z.ZodObject<typeof getRunUserSchema>>;

async function getRunUserTool(context: ServerContext, params: GetRunUserParams): Promise<string> {
  const user = (await context.resources.run.userInfo(params.run_user_id)) as unknown as Record<string, unknown>;
  return renderItem(user, ["id", "name", "email", "active", "tags", "last_login", "created_at"], params.response_format);
}

const getRunUserConfigJSON: IToolConfig = {
  name: "get_run_user",
  description: `Fetches one TagoRUN end user by ID with their account details.

Use when you already know the run user ID (from search_run_users) and need their profile details, such as email, activity status, tags, or last login. This tool covers TagoRUN end users only, not TagoIO account team members.

<example>
{"run_user_id": "61f0000000000000000f0001"}
</example>`,
  parameters: getRunUserSchema,
  title: "Get Run User",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getRunUserTool,
};

export { getRunUserConfigJSON };
