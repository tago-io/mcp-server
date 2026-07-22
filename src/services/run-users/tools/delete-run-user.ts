import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";

const deleteRunUserBaseSchema = z.object({
  run_user_id: resourceIdSchema("run user ID"),
});

type DeleteRunUserSchema = z.infer<typeof deleteRunUserBaseSchema>;

async function deleteRunUserTool(context: ServerContext, params: DeleteRunUserSchema): Promise<string> {
  await context.resources.run.userDelete(params.run_user_id);
  return `Run user \`${params.run_user_id}\` permanently deleted, along with every run-user token it holds (including any login tokens minted with login_as_run_user).`;
}

const deleteRunUserConfigJSON: IToolConfig = {
  name: "delete_run_user",
  description: `Permanently deletes an end user from the account's TagoRUN portal by ID. This is a hard delete: the user and every run-user token it holds (including any login tokens minted with login_as_run_user) are revoked and cannot be recovered.

Use this only when the user explicitly asks to remove a TagoRUN end user. Confirm the target with get_run_user or search_run_users first if there is any ambiguity. Deleting a user is the way to revoke a login token minted for them, since minted login tokens have no individual revocation endpoint.

<example>
{ "run_user_id": "61f00000000000000c900001" }
</example>

Key limitations: deletion cannot be undone; the server returns 404 for an unknown ID; every token the user holds is revoked with them.`,
  parameters: deleteRunUserBaseSchema.shape,
  title: "Delete Run User",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteRunUserTool,
};

export { deleteRunUserConfigJSON };
