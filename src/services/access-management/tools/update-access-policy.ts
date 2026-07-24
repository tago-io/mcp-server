import type { AccessInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { requireAtLeastOne } from "../../../utils/cross-field";
import { resourceIdSchema, tagsObjectModel } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";
import { CATALOG_UNAVAILABLE_NOTE, TargetType, loadCatalogForValidation } from "../permission-catalog";
import { permissionInputSchema, targetInputSchema, toPermissionWire, toTargetWire, validatePermissions } from "../policy-input";
import { PolicyWire, renderPolicyRules } from "../policy-render";

const EDITABLE_FIELDS = ["name", "active", "tags", "permissions", "targets"] as const;

const updateAccessPolicyBaseSchema = z.object({
  access_policy_id: resourceIdSchema("access policy ID"),
  name: z.string().min(1).max(100).describe("New name for the policy.").optional(),
  targets: z
    .array(targetInputSchema)
    .min(1)
    .describe("REPLACES every target on the policy. Pass the complete list you want, not just the ones being added; read the current list with get_access_policy first.")
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

function targetTypesOf(targets: string[][]): TargetType[] {
  return [...new Set(targets.map((target) => target[0]).filter((type): type is TargetType => type === "analysis" || type === "run_user"))];
}

async function updateAccessPolicyTool(context: ServerContext, params: UpdateAccessPolicySchema): Promise<string> {
  const replacesRules = params.permissions !== undefined || params.targets !== undefined;

  // Only a rule or target replacement needs the current policy: it supplies the
  // target kinds the new rules are checked against, and the before/after view
  // that makes a wholesale replacement visible. A name or active change does
  // not, so it costs no extra request.
  const existing = replacesRules ? ((await context.resources.accessManagement.info(params.access_policy_id)) as unknown as PolicyWire) : undefined;

  const targets = params.targets?.map(toTargetWire);
  const permissions = params.permissions?.map(toPermissionWire);

  let catalog;
  if (params.permissions !== undefined) {
    const effectiveTargets = targets ?? existing?.targets ?? [];
    catalog = await loadCatalogForValidation(context);
    if (catalog) {
      validatePermissions(catalog, targetTypesOf(effectiveTargets), params.permissions);
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
    sections.push(
      "",
      "**Before**",
      renderPolicyRules(existing, catalog),
      "",
      "**After**",
      renderPolicyRules({ targets: targets ?? existing.targets, permissions: permissions ?? existing.permissions }, catalog)
    );
    sections.push("", "Rule and target lists are replaced whole, so anything absent from the request above is gone.");
  }
  if (params.permissions !== undefined && !catalog) {
    sections.push("", CATALOG_UNAVAILABLE_NOTE);
  }

  return sections.join("\n");
}

const updateAccessPolicyConfigJSON: IToolConfig = {
  name: "update_access_policy",
  description: `Updates an Access Management policy: rename it, activate or deactivate it, retag it, or replace its rules or targets.

\`permissions\` and \`targets\` REPLACE the existing lists rather than merging into them, because that is all the API offers. Read the policy with get_access_policy first and pass the complete list you want, or the rules you did not mention will be deleted. The result shows the policy before and after so the replacement is visible.

Deactivating (\`active: false\`) is the reversible way to switch a policy off while keeping it, and is usually better than deleting it while diagnosing.

<example>
{ "access_policy_id": "6299f0b1c72f2f00181d8b3c", "active": false }
</example>

Key limitations: no partial edit of a rule list; a rule that could never match is refused before anything is written; the policy's targets decide which grants are valid, so changing targets can invalidate rules you are keeping.`,
  parameters: updateAccessPolicyBaseSchema.shape,
  title: "Update Access Policy",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: updateAccessPolicyCrossField,
  tool: updateAccessPolicyTool,
};

export { updateAccessPolicyConfigJSON };
