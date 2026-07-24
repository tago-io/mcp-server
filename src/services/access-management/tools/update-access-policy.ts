import type { AccessInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { requireAtLeastOne } from "../../../utils/cross-field";
import { resourceIdSchema, tagsObjectModel } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";
import { PermissionCatalog, TargetType, fetchPermissionCatalog } from "../permission-catalog";
import { PermissionInput, permissionInputSchema, targetInputSchema, toPermissionWire, toTargetWire, validatePermissions, validateRetainedPermissions } from "../policy-input";
import { PolicyRule, PolicyWire, orderLikeApi, renderPolicyRules, renderTargets } from "../policy-render";
import { parseMatchTuple } from "../policy-rules";

const EDITABLE_FIELDS = ["name", "active", "tags", "permissions", "targets"] as const;

const updateAccessPolicyBaseSchema = z.object({
  access_policy_id: resourceIdSchema("access policy ID"),
  name: z.string().min(1).max(100).describe("New name for the policy.").optional(),
  targets: z
    .array(targetInputSchema)
    .min(1)
    .describe(
      "REPLACES every target on the policy. Pass the complete list you want, not just the ones being added; read the current list with get_access_policy first. Changing the kind of token a policy applies to can invalidate rules you are keeping, so pass `permissions` in the same call when it does."
    )
    .optional(),
  permissions: z
    .array(permissionInputSchema)
    .min(1)
    .describe("REPLACES every rule on the policy. Pass the complete list you want, not just the ones being added; read the current list with get_access_policy first.")
    .optional(),
  active: z.boolean().describe("Whether the policy takes effect. An inactive policy grants nothing.").optional(),
  tags: z.array(tagsObjectModel).describe("REPLACES the policy's tags. E.g: [{ key: 'purpose', value: 'parser' }]").optional(),
});

type UpdateAccessPolicySchema = z.infer<typeof updateAccessPolicyBaseSchema>;

const updateAccessPolicyCrossField = requireAtLeastOne(
  EDITABLE_FIELDS,
  "update",
  `at least one of ${EDITABLE_FIELDS.join(", ")} must be provided alongside access_policy_id`,
  '{ "access_policy_id": "6299f0b1c72f2f00181d8b3c", "active": false }'
);

/** The same notion of a resolvable target the renderer uses: a malformed tuple selects no policy, so its kind does not count. */
function targetTypesOf(targets: string[][]): TargetType[] {
  return renderTargets(targets).types;
}

/**
 * Reads stored rules back into the input shape so they can be checked against
 * new targets.
 *
 * A rule whose tuple does not parse is dropped rather than reported: it already
 * grants nothing today, so blocking an unrelated edit on it would make a policy
 * carrying legacy junk permanently uneditable through this tool.
 */
function toInputShape(permissions: readonly PolicyRule[]): PermissionInput[] {
  const inputs: PermissionInput[] = [];
  for (const [sourceIndex, permission] of permissions.entries()) {
    const match = parseMatchTuple(permission.resource ?? []);
    if (!match) {
      continue;
    }
    // `sourceIndex` is the rule's position in the stored policy, which is what
    // get_access_policy numbers. Reporting our filtered position instead would
    // point the caller at a different rule.
    inputs.push({ effect: permission.effect === "deny" ? "deny" : "allow", resource: (permission.resource ?? [])[0], actions: [...(permission.action ?? [])], match, sourceIndex });
  }
  return inputs;
}

async function updateAccessPolicyTool(context: ServerContext, params: UpdateAccessPolicySchema): Promise<string> {
  const replacesRules = params.permissions !== undefined || params.targets !== undefined;

  // Only a rule or target replacement needs the current policy: it supplies the
  // rules that will survive the change and the before/after view that makes a
  // wholesale replacement visible. A name or active change needs neither.
  const existing = replacesRules ? ((await context.resources.accessManagement.info(params.access_policy_id)) as unknown as PolicyWire) : undefined;

  const targets = params.targets?.map(toTargetWire);
  const permissions = params.permissions?.map(toPermissionWire);

  let catalog: PermissionCatalog | undefined;
  if (replacesRules) {
    // Fetched, never skipped: changing targets can invalidate rules that are
    // being kept, so the check is needed even when no rule was submitted.
    catalog = await fetchPermissionCatalog(context);

    const nextTargetTypes = targetTypesOf(targets ?? existing?.targets ?? []);

    if (params.permissions !== undefined) {
      // Every rule is newly submitted, so every defect is one the caller is
      // introducing right now.
      validatePermissions(catalog, nextTargetTypes, params.permissions);
    } else {
      // Rules are being kept while the targets move under them. Only defects
      // the move introduces are the caller's to fix.
      validateRetainedPermissions(catalog, targetTypesOf(existing?.targets ?? []), nextTargetTypes, toInputShape(existing?.permissions ?? []));
    }
  }

  const update: Record<string, unknown> = {};
  if (params.name !== undefined) {
    update.name = params.name;
  }
  if (params.active !== undefined) {
    update.active = params.active;
  }
  if (params.tags !== undefined) {
    update.tags = params.tags;
  }
  if (permissions !== undefined) {
    update.permissions = permissions;
  }
  if (targets !== undefined) {
    update.targets = targets;
  }

  await context.resources.accessManagement.edit(params.access_policy_id, update as Partial<AccessInfo>);

  const changed = Object.keys(update).join(", ");
  const sections = [`Access policy \`${params.access_policy_id}\` updated (${changed}).`];

  if (existing) {
    const after = { targets: targets ?? existing.targets, permissions: orderLikeApi(permissions ?? existing.permissions ?? []) };
    sections.push("", "**Before**", renderPolicyRules(existing, catalog), "", "**After**", renderPolicyRules(after, catalog));
    sections.push("", "Rule and target lists are replaced whole, so anything absent from the request above is gone.");
  }
  if (params.active === false) {
    sections.push("", "This policy is now INACTIVE, so none of its rules apply until it is activated again.");
  }

  return sections.join("\n");
}

const updateAccessPolicyConfigJSON: IToolConfig = {
  name: "update_access_policy",
  description: `Updates an Access Management policy: rename it, activate or deactivate it, retag it, or replace its rules or targets.

\`permissions\` and \`targets\` REPLACE the existing lists rather than merging into them, because that is all the API offers. Read the policy with get_access_policy first and pass the complete list you want, or the rules you did not mention will be deleted. The result shows the policy before and after so the replacement is visible.

Changing targets alone can strand rules that are kept: a rule valid for an analysis is usually meaningless for a TagoRUN user. A grant that the permission catalog says could no longer fire is refused before anything is written, so pass \`permissions\` in the same call when repointing a policy. That check is catalog-level: a rule scoped by \`tag_match\` can still stop matching because the new targets do not carry the tag, which depends on their data rather than on the catalog, so verify a repointed policy with get_access_policy.

Deactivating (\`active: false\`) is the reversible way to switch a policy off while keeping it, and is usually better than deleting it while diagnosing.

<example>
{ "access_policy_id": "6299f0b1c72f2f00181d8b3c", "active": false }
</example>

Key limitations: no partial edit of a rule list, so an unmentioned rule is lost; a grant that could never match is refused before anything is written, but only what the permission catalog can express, not tag data on the targets themselves; rules already stored in a shape the platform cannot read are left out of that check, since they grant nothing either way.`,
  parameters: updateAccessPolicyBaseSchema.shape,
  title: "Update Access Policy",
  // Replacing a rule list irreversibly discards the rules it replaces, which is
  // the repo's definition of destructive, matching update_entity_schema.
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  crossFieldSchema: updateAccessPolicyCrossField,
  tool: updateAccessPolicyTool,
};

export { updateAccessPolicyConfigJSON };
