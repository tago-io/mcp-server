import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";

const deleteAccessPolicyBaseSchema = z.object({
  access_policy_id: resourceIdSchema("access policy ID"),
});

type DeleteAccessPolicySchema = z.infer<typeof deleteAccessPolicyBaseSchema>;

async function deleteAccessPolicyTool(context: ServerContext, params: DeleteAccessPolicySchema): Promise<string> {
  await context.resources.accessManagement.delete(params.access_policy_id);
  return `Access policy \`${params.access_policy_id}\` deleted. Every analysis or TagoRUN user it granted loses those permissions immediately.`;
}

const deleteAccessPolicyConfigJSON: IToolConfig = {
  name: "delete_access_policy",
  description: `Permanently deletes an Access Management policy, immediately revoking every permission it granted.

Use this only when the user explicitly asks to remove a policy. Anything the policy allowed starts failing with "Authorization Denied" as soon as it is gone, and analyses fail at runtime rather than at deploy time, so read it with get_access_policy first and prefer update_access_policy with \`active: false\` when the intent is to switch it off while diagnosing.

<example>
{ "access_policy_id": "6299f0b1c72f2f00181d8b3c" }
</example>

Key limitations: deletion cannot be undone and the rules are lost (fetch them with get_access_policy beforehand if the policy may need recreating); other policies may grant some of the same permissions, so removing one does not guarantee access is revoked.`,
  parameters: deleteAccessPolicyBaseSchema.shape,
  title: "Delete Access Policy",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteAccessPolicyTool,
};

export { deleteAccessPolicyConfigJSON };
