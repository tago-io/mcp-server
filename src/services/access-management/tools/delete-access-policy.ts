import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";

const deleteAccessPolicyBaseSchema = z.object({
  access_policy_id: resourceIdSchema("access policy ID"),
});

type DeleteAccessPolicySchema = z.infer<typeof deleteAccessPolicyBaseSchema>;

async function deleteAccessPolicyTool(context: ServerContext, params: DeleteAccessPolicySchema): Promise<string> {
  await context.resources.accessManagement.delete(params.access_policy_id);
  // Deleting one policy does not settle the question of access: matching
  // policies are pooled before evaluation, so another may grant the same thing.
  return `Access policy \`${params.access_policy_id}\` deleted. Anything it was the only source of is revoked immediately. Access it shared with another policy survives, since matching policies are pooled before a request is evaluated, so confirm with search_access_policies if revocation is the point.`;
}

const deleteAccessPolicyConfigJSON: IToolConfig = {
  name: "delete_access_policy",
  description: `Permanently deletes an Access Management policy, removing every grant it was the source of.

Use this only when the user explicitly asks to remove a policy. Anything the policy allowed stops working as soon as it is gone: an analysis fails at runtime with "Authorization Denied" rather than at deploy time, and a TagoRUN user gets no error at all, the resources simply vanish from their lists. So read it with get_access_policy first and prefer setting \`active: false\` with the update tool for its target kind when the intent is to switch it off while diagnosing.

Deleting and recreating is also the only way to move a policy between target kinds, since neither update tool will repoint one from analyses to TagoRUN users or back.

<example>
{ "access_policy_id": "6299f0b1c72f2f00181d8b3c" }
</example>

Key limitations: deletion cannot be undone and the rules are lost (fetch them with get_access_policy beforehand if the policy may need recreating); matching policies are pooled before a request is evaluated, so another policy granting the same thing keeps that access alive and removing one policy does not guarantee revocation.`,
  parameters: deleteAccessPolicyBaseSchema.shape,
  title: "Delete Access Policy",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteAccessPolicyTool,
};

export { deleteAccessPolicyConfigJSON };
