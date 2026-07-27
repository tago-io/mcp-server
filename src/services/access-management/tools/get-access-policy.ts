import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";
import { CATALOG_UNREADABLE_NOTE, catalogForRead } from "../permission-catalog";
import { PolicyWire, renderPolicyRules, targetKindsOf } from "../policy-render";

const getAccessPolicyBaseSchema = z.object({
  access_policy_id: resourceIdSchema("access policy ID"),
  response_format: responseFormatSchema,
});

type GetAccessPolicySchema = z.infer<typeof getAccessPolicyBaseSchema>;

async function getAccessPolicyTool(context: ServerContext, params: GetAccessPolicySchema): Promise<string> {
  const policy = (await context.resources.accessManagement.info(params.access_policy_id)) as unknown as PolicyWire;

  // The catalog turns wire values into the names the Admin console shows and is
  // what makes an inert rule visible. Losing it costs labelling, not the read.
  const catalog = await catalogForRead(context);

  const summary = renderItem(
    { id: policy.id, name: policy.name, active: policy.active, tags: policy.tags, created_at: policy.created_at, updated_at: policy.updated_at },
    ["id", "name", "active", "tags"],
    params.response_format
  );

  const sections = [summary, "", renderPolicyRules(policy, catalog)];

  // Naming the tool that owns this policy is the whole reason to read it before
  // editing: the target kind decides which update tool is valid, and the search
  // route cannot report it because it returns no targets at all.
  const kinds = targetKindsOf(policy.targets ?? []);
  if (kinds.length === 1) {
    sections.push("", `Edit this policy with update_${kinds[0]}_access_policy; the other update tool will refuse it.`);
  } else if (kinds.length > 1) {
    sections.push("", "Either update tool can rename this policy, retag it, or set `active: false`; neither will replace its rules or targets.");
  }

  if (policy.active === false) {
    sections.push(
      "",
      `This policy is INACTIVE, so none of the rules above apply. Activate it with ${kinds.length === 1 ? `update_${kinds[0]}_access_policy` : "the update tool for its target kind"}.`
    );
  }
  if (!catalog) {
    sections.push("", CATALOG_UNREADABLE_NOTE);
  }

  return sections.join("\n");
}

const getAccessPolicyConfigJSON: IToolConfig = {
  name: "get_access_policy",
  description: `Retrieves one Access Management policy by ID and renders what it actually grants: which analyses or TagoRUN users it applies to, and its rules in evaluation order.

This is the only way to see a policy's rules or its targets; search_access_policies returns neither. Use it to work out why an analysis is denied at runtime, and always before changing a policy: the update tools replace rule lists wholesale rather than merging into them, and the target kind decides which of them is valid. The output names that tool.

Rules that the API stored but can never match (an action the resource does not have, a match form it does not accept, a malformed entry) are flagged INERT. An inert rule is the usual reason a policy exists and still does not work.

A policy targeting both an analysis and a TagoRUN user is flagged too. Rules are not split between the two: every rule applies to whichever kind matched, so any rule naming a resource both kinds share grants to both. Such a policy can still be switched off with \`active: false\` from either update tool, but neither will replace its rules.

<example>
{ "access_policy_id": "6299f0b1c72f2f00181d8b3c" }
</example>

Key limitations: this shows what a policy says, not whether a given token would be allowed; the platform defines no evaluation order across separate policies, so a conflict spanning two of them has no predictable winner.`,
  parameters: getAccessPolicyBaseSchema.shape,
  title: "Get Access Policy",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getAccessPolicyTool,
};

export { getAccessPolicyConfigJSON };
