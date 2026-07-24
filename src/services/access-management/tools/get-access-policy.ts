import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";
import { fetchPermissionCatalog } from "../permission-catalog";
import { PolicyWire, renderPolicyRules } from "../policy-render";

const getAccessPolicyBaseSchema = z.object({
  access_policy_id: resourceIdSchema("access policy ID"),
  response_format: responseFormatSchema,
});

type GetAccessPolicySchema = z.infer<typeof getAccessPolicyBaseSchema>;

async function getAccessPolicyTool(context: ServerContext, params: GetAccessPolicySchema): Promise<string> {
  const policy = (await context.resources.accessManagement.info(params.access_policy_id)) as unknown as PolicyWire;

  // The catalog turns wire values into the names the Admin console shows and is
  // what makes an inert rule visible. Losing it costs labelling, not the read.
  const catalog = await fetchPermissionCatalog(context).catch(() => undefined);

  const summary = renderItem(
    { id: policy.id, name: policy.name, active: policy.active, tags: policy.tags, created_at: policy.created_at, updated_at: policy.updated_at },
    ["id", "name", "active", "tags"],
    params.response_format
  );

  const sections = [summary, "", renderPolicyRules(policy, catalog)];

  if (policy.active === false) {
    sections.push("", "This policy is INACTIVE, so none of the rules above apply. Activate it with update_access_policy.");
  }
  if (!catalog) {
    sections.push(
      "",
      "The permission catalog (`GET /am/settings`) could not be read, so rules are shown with their raw wire values and were not checked for whether they can ever match."
    );
  }

  return sections.join("\n");
}

const getAccessPolicyConfigJSON: IToolConfig = {
  name: "get_access_policy",
  description: `Retrieves one Access Management policy by ID and renders what it actually grants: which analyses or TagoRUN users it applies to, and its rules in evaluation order.

This is the only way to see a policy's rules; search_access_policies cannot return them. Use it to work out why an analysis is denied at runtime, or to read a policy before changing it, since update_access_policy replaces rule lists wholesale rather than merging into them.

Rules that the API stored but can never match (an action the resource does not have, a match form it does not accept, a malformed entry) are flagged INERT. An inert rule is the usual reason a policy exists and still does not work.

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
