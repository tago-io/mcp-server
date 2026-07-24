import type { AccessCreateInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { tagsObjectModel } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";
import { fetchPermissionCatalog } from "../permission-catalog";
import { permissionInputSchema, targetInputSchema, toPermissionWire, toTargetWire, validatePermissions } from "../policy-input";
import { orderLikeApi, renderPolicyRules } from "../policy-render";

const createAccessPolicyBaseSchema = z.object({
  name: z.string().min(1).max(100).describe('Name for the policy. The Admin console convention is to name it after what it is for, e.g. "[Analysis] - Parser device access".'),
  targets: z.array(targetInputSchema).min(1).describe("Which analyses or TagoRUN users the policy applies to. A policy with no targets grants nothing."),
  permissions: z.array(permissionInputSchema).min(1).describe("The rules. Each names a resource, the actions allowed or denied on it, and which resources of that type it covers."),
  active: z.boolean().describe("Whether the policy takes effect immediately. Defaults to true; an inactive policy grants nothing.").optional(),
  tags: z.array(tagsObjectModel).describe("Tags for the policy. E.g: [{ key: 'purpose', value: 'parser' }]").optional(),
});

type CreateAccessPolicySchema = z.infer<typeof createAccessPolicyBaseSchema>;

async function createAccessPolicyTool(context: ServerContext, params: CreateAccessPolicySchema): Promise<string> {
  const targetTypes = [...new Set(params.targets.map((target) => target.type))];
  // Fetched, not optional: a policy written without this check is exactly the
  // silently-inert policy this domain exists to prevent, and the usual fallback
  // of "write anyway and verify afterwards" needs the same route that failed.
  const catalog = await fetchPermissionCatalog(context);
  validatePermissions(catalog, targetTypes, params.permissions);

  const targets = params.targets.map(toTargetWire);
  const permissions = params.permissions.map(toPermissionWire);

  const result = await context.resources.accessManagement.create({
    name: params.name,
    active: params.active,
    tags: params.tags,
    permissions,
    // The SDK types `targets` as an empty tuple (an unresolved TODO in the
    // published types); the wire shape is a list of tuples, built above.
    targets: targets as unknown as AccessCreateInfo["targets"],
  });

  // Rendered in the order the API will report and evaluate them, not the order
  // they were submitted in, so the "last match wins" note above is truthful.
  const sections = [`Access policy \`${result.am_id}\` created.`, "", renderPolicyRules({ targets, permissions: orderLikeApi(permissions) }, catalog)];
  if (params.active === false) {
    sections.push("", "This policy was created INACTIVE, so none of its rules apply until it is activated with update_access_policy.");
  }

  return sections.join("\n");
}

const createAccessPolicyConfigJSON: IToolConfig = {
  name: "create_access_policy",
  description: `Creates an Access Management policy: the grant that lets an analysis or a TagoRUN user act on resources it does not own.

Use this when an analysis fails at runtime with "Authorization Denied". An analysis using the SDK's Resources class has no permissions of its own, so every device, entity, or dashboard it touches needs a rule here. Call lookup_access_permissions first to get the exact \`resource\` and \`actions\` values, and prefer targeting and scoping by tag over listing IDs, so the policy keeps working as resources are added.

Rules that the API would store but could never match are refused before anything is created, since such a policy looks correct and grants nothing.

<example>
{
  "name": "[Analysis] - Parser device access",
  "targets": [{ "type": "analysis", "match": { "by": "id", "id": "6299f0b1c72f2f00181d8b3c" } }],
  "permissions": [
    { "effect": "allow", "resource": "device", "actions": ["send_data", "get_data"], "match": { "by": "tag", "key": "device_type", "value": "sensor" } }
  ]
}
</example>

Key limitations: policies apply to analysis and run_user tokens only, so they never change what this MCP server itself can do (a profile token bypasses Access Management entirely); each profile has a plan limit on how many policies it may hold; a rule that matches nothing is silently harmless rather than an error, so verify with get_access_policy.`,
  parameters: createAccessPolicyBaseSchema.shape,
  title: "Create Access Policy",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: createAccessPolicyTool,
};

export { createAccessPolicyConfigJSON };
