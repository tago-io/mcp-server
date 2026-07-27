import type { AccessCreateInfo, AccessInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { requireAtLeastOne } from "../../../utils/cross-field";
import { resourceIdSchema, tagsObjectModel } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";
import { CATALOG_UNREADABLE_NOTE, PermissionCatalog, TargetType, catalogForRead, fetchPermissionCatalog } from "../permission-catalog";
import { assertResolvableTargets, permissionInputSchema, toPermissionWire, toTargetWire, validatePermissions } from "../policy-input";
import { MIXED_TARGET_CONSEQUENCE, PolicyWire, orderLikeApi, renderPolicyRules, targetKindsOf } from "../policy-render";
import { targetMatchSchema } from "../policy-rules";

/**
 * The four policy write tools, built once per target kind.
 *
 * Access Management governs `analysis` and `run_user` tokens, and the two are
 * different enough that a merged tool cannot serve either well: five resource
 * names appear under both kinds with different action sets, so `dashboard`
 * offers a run user `access` and `arrangement`, and an analysis `access` plus
 * six others it does not share. Binding the kind to the tool lets each one
 * validate against exactly one catalog and describe exactly one failure mode.
 *
 * It also closes a quiet over-grant. The API validates each target on its own
 * and never correlates a target to the rules beside it, and evaluation pools a
 * matched policy's whole rule list without filtering by kind, so a policy
 * holding both kinds hands every shared-resource rule to both. A tool whose
 * kind is fixed cannot express that policy at all.
 *
 * Both variants come from one factory so they cannot drift in behaviour, and
 * the prose they share is interpolated from constants for the same reason: the
 * platform's own agent tooling split these tools and its two hand-written
 * descriptions have already fallen out of step with its catalog.
 */

interface KindCopy {
  /** Wire value and the word used in tool names. */
  type: TargetType;
  /** Tool-name fragment, e.g. `run_user`. */
  slug: string;
  /** Title-case fragment for the tool title. */
  titleWord: string;
  /** Plural noun for prose, e.g. "TagoRUN users". */
  plural: string;
  /** How this kind of token experiences a missing grant. */
  denial: string;
  /** One-line statement of what this kind can be granted. */
  reach: string;
  /** A representative policy, used as the create example. */
  example: string;
  /** Suggested naming convention, matching the Admin console. */
  namingHint: string;
}

const ANALYSIS: KindCopy = {
  type: "analysis",
  slug: "analysis",
  titleWord: "Analysis",
  plural: "analyses",
  denial: 'the analysis fails at runtime with "Authorization Denied", after deploying cleanly',
  reach: "An analysis can be granted on 17 resource types, including device data, files, secrets, and other analyses.",
  example: `{
  "name": "[Analysis] - Parser device access",
  "targets": [{ "by": "id", "id": "6299f0b1c72f2f00181d8b3c" }],
  "permissions": [
    { "effect": "allow", "resource": "device", "actions": ["send_data", "get_data"], "match": { "by": "tag", "key": "device_type", "value": "sensor" } }
  ]
}`,
  namingHint: '"[Analysis] - Parser device access"',
};

const RUN_USER: KindCopy = {
  type: "run_user",
  slug: "run_user",
  titleWord: "Run-User",
  plural: "TagoRUN users",
  denial: "the user gets no error at all; the resources simply do not appear, because list routes return only what the token may see, so an empty list IS the denial",
  reach: "A TagoRUN user can be granted far less than an analysis: only `device`, `entity`, `dashboard`, `run_user` and `sql`, and mostly only `access` on them.",
  example: `{
  "name": "[RUN] - Plant floor dashboard access",
  "targets": [{ "by": "tag", "key": "site", "value": "plant-a" }],
  "permissions": [
    { "effect": "allow", "resource": "dashboard", "actions": ["access"], "match": { "by": "id", "id": "6299f0b1c72f2f00181d8b3c" } }
  ]
}`,
  namingHint: '"[RUN] - Plant floor dashboard access"',
};

const KINDS: Record<TargetType, KindCopy> = { analysis: ANALYSIS, run_user: RUN_USER };

/** The other tool to reach for, named in every kind-mismatch refusal. */
function otherKind(targetType: TargetType): KindCopy {
  return KINDS[targetType === "analysis" ? "run_user" : "analysis"];
}

const MATCH_FORMS_DOC =
  "Each rule's `match` decides which resources of that type it covers: `any` (all of them), `id` (one, by 24-character ID), `tag` (a key and value the resource carries), `tag_match` (a key whose value must be the same on the target and on the resource), or `path` (a storage prefix, files only). A form the grant does not accept is stored and then never matches, so lookup_access_permissions reports the accepted forms as `match_by`.";

const REPLACEMENT_DOC =
  "`permissions` and `targets` REPLACE the existing lists rather than merging into them, because that is all the API offers. Read the policy with get_access_policy first and pass the complete list you want, or the rules you did not mention will be deleted. The result shows the policy before and after so the replacement is visible.";

function targetsDescription(kind: KindCopy, replacing: boolean): string {
  const lead = replacing ? `REPLACES every target on the policy. Pass the complete list you want, not just the ones being added.` : `Which ${kind.plural} the policy applies to.`;
  return `${lead} Every target is ${kind.type === "analysis" ? "an analysis" : "a TagoRUN user"}; this tool cannot target the other kind. Scope by tag rather than by ID where you can, so the policy keeps working as ${kind.plural} are added.`;
}

/**
 * Reads the policy and refuses it when it is not this tool's to edit.
 *
 * `rewrites` says whether the caller is replacing the rule or target list. A
 * mixed policy refuses those, because replacing either one silently resolves it
 * to a single kind and drops what the other kind had. It still accepts a
 * rename, a retag, and above all `active: false`, which is the reversible way
 * to switch a bad policy off and the thing these tools tell callers to reach
 * for while diagnosing. Refusing that too would leave deletion as the only
 * remedy for the one policy shape most likely to need switching off in a hurry.
 */
async function loadOwnPolicy(context: ServerContext, kind: KindCopy, policyId: string, rewrites: boolean): Promise<PolicyWire> {
  const policy = (await context.resources.accessManagement.info(policyId)) as unknown as PolicyWire;
  const kinds = targetKindsOf(policy.targets ?? []);

  if (kinds.length > 1 && rewrites) {
    throw new Error(
      `Access policy \`${policyId}\` targets both an analysis and a TagoRUN user, so no rule or target list on it can be replaced by a tool that owns one kind. ${MIXED_TARGET_CONSEQUENCE} Its name, tags, and \`active\` flag can still be changed from either update tool, and setting \`active: false\` switches it off without losing anything.`
    );
  }
  // No resolvable target means the policy grants nothing to anyone, so no kind
  // owns it and either tool may repair it by supplying targets.
  if (kinds.length === 1 && kinds[0] !== kind.type) {
    const other = otherKind(kind.type);
    throw new Error(
      `Access policy \`${policyId}\` targets ${other.plural}, not ${kind.plural}, so this tool will not edit it. Use update_${other.slug}_access_policy instead. A policy's target kind cannot be changed in place: to move it, delete this policy and create the replacement with create_${other.slug}_access_policy.`
    );
  }

  return policy;
}

function buildCreateTool(kind: KindCopy): IToolConfig {
  const schema = z.object({
    name: z.string().min(1).max(100).describe(`Name for the policy. The Admin console convention is to name it after what it is for, e.g. ${kind.namingHint}.`),
    targets: z.array(targetMatchSchema).min(1).describe(targetsDescription(kind, false)),
    permissions: z
      .array(permissionInputSchema)
      .min(1)
      .describe("The rules. Each names a resource, the actions allowed or denied on it, and which resources of that type it covers."),
    active: z.boolean().describe("Whether the policy takes effect immediately. Defaults to true; an inactive policy grants nothing.").optional(),
    tags: z.array(tagsObjectModel).describe("Tags for the policy. E.g: [{ key: 'purpose', value: 'parser' }]").optional(),
  });

  type Schema = z.infer<typeof schema>;

  async function handler(context: ServerContext, params: Schema): Promise<string> {
    // Fetched, not optional: a policy written without this check is exactly the
    // silently-inert policy this domain exists to prevent, and the usual fallback
    // of "write anyway and verify afterwards" needs the same route that failed.
    const catalog = await fetchPermissionCatalog(context);
    validatePermissions(catalog, kind.type, params.permissions);

    const targets = params.targets.map((match) => toTargetWire(kind.type, match));
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
    // they were submitted in, so the "last match wins" note is truthful.
    const sections = [`Access policy \`${result.am_id}\` created.`, "", renderPolicyRules({ targets, permissions: orderLikeApi(permissions) }, catalog)];
    if (params.active === false) {
      sections.push("", `This policy was created INACTIVE, so none of its rules apply until it is activated with update_${kind.slug}_access_policy.`);
    }

    return sections.join("\n");
  }

  return {
    name: `create_${kind.slug}_access_policy`,
    description: `Creates an Access Management policy targeting ${kind.plural}: the grant that lets ${
      kind.type === "analysis" ? "an analysis" : "a TagoRUN user"
    } act on resources it does not own.

Use this when ${kind.denial}. ${
      kind.type === "analysis"
        ? "An analysis using the SDK's Resources class has no permissions of its own, so every device, entity, or dashboard it touches needs a rule here."
        : "A TagoRUN user sees only what a policy grants, so a dashboard or device missing from their app is usually a missing rule here."
    } ${kind.reach}

Call lookup_access_permissions with \`target_type: "${kind.type}"\` first to get the exact \`resource\` and \`actions\` values. ${MATCH_FORMS_DOC}

Rules that the API would store but could never match are refused before anything is created, since such a policy looks correct and grants nothing.

<example>
${kind.example}
</example>

Key limitations: this tool only ever targets ${kind.plural}; use create_${otherKind(kind.type).slug}_access_policy for the other kind, and note that one policy cannot safely serve both, because a policy's rules apply to every kind it targets. Policies never change what this MCP server itself can do, since a profile token bypasses Access Management entirely. Each profile has a plan limit on how many policies it may hold, shared across both kinds.`,
    parameters: schema.shape,
    title: `Create ${kind.titleWord} Access Policy`,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    mutationClass: "write",
    tool: handler,
  };
}

function buildUpdateTool(kind: KindCopy): IToolConfig {
  const EDITABLE_FIELDS = ["name", "active", "tags", "permissions", "targets"] as const;

  const schema = z.object({
    access_policy_id: resourceIdSchema("access policy ID"),
    name: z.string().min(1).max(100).describe("New name for the policy.").optional(),
    targets: z.array(targetMatchSchema).min(1).describe(targetsDescription(kind, true)).optional(),
    permissions: z
      .array(permissionInputSchema)
      .min(1)
      .describe("REPLACES every rule on the policy. Pass the complete list you want, not just the ones being added; read the current list with get_access_policy first.")
      .optional(),
    active: z.boolean().describe("Whether the policy takes effect. An inactive policy grants nothing.").optional(),
    tags: z.array(tagsObjectModel).describe("REPLACES the policy's tags. E.g: [{ key: 'purpose', value: 'parser' }]").optional(),
  });

  type Schema = z.infer<typeof schema>;

  async function handler(context: ServerContext, params: Schema): Promise<string> {
    const showsDiff = params.permissions !== undefined || params.targets !== undefined;
    // Read first on every path, including a rename. The tool's name asserts
    // which kind of policy it edits, and it cannot honour that claim without
    // seeing the stored targets.
    const existing = await loadOwnPolicy(context, kind, params.access_policy_id, showsDiff);

    const targets = params.targets?.map((match) => toTargetWire(kind.type, match));
    const permissions = params.permissions?.map(toPermissionWire);

    // Validating a submitted rule list fails closed; labelling a rendered diff
    // degrades. A write that cannot be checked is the policy this domain exists
    // to prevent, and "write anyway and verify later" needs the route that just
    // failed.
    let catalog: PermissionCatalog | undefined;
    if (params.permissions !== undefined) {
      catalog = await fetchPermissionCatalog(context);
      // Rules are only meaningful once some token can reach them. Submitted
      // targets always resolve, so this only catches assigning rules to a
      // policy whose stored targets the platform cannot match.
      assertResolvableTargets(kind.type, targetKindsOf(targets ?? existing.targets ?? []));
      validatePermissions(catalog, kind.type, params.permissions);
    } else if (showsDiff) {
      catalog = await catalogForRead(context);
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

    if (showsDiff) {
      const after = { targets: targets ?? existing.targets, permissions: orderLikeApi(permissions ?? existing.permissions ?? []) };
      sections.push("", "**Before**", renderPolicyRules(existing, catalog), "", "**After**", renderPolicyRules(after, catalog));
      sections.push("", "Rule and target lists are replaced whole, so anything absent from the request above is gone.");
      if (!catalog) {
        sections.push("", CATALOG_UNREADABLE_NOTE);
      }
    }
    if (params.active === false) {
      sections.push("", "This policy is now INACTIVE, so none of its rules apply until it is activated again.");
    }

    return sections.join("\n");
  }

  const other = otherKind(kind.type);

  return {
    name: `update_${kind.slug}_access_policy`,
    description: `Updates an Access Management policy that targets ${kind.plural}: rename it, activate or deactivate it, retag it, or replace its rules or targets.

Check the policy with get_access_policy first. The target kind decides which update tool is valid, and search_access_policies cannot tell you: the list route returns no targets at all. Calling this on a policy that targets ${other.plural} is refused outright. A policy targeting BOTH kinds can still be renamed, retagged, or switched off here with \`active: false\`, but neither tool will replace its rules or targets, because that would resolve it to one kind and silently drop the other.

${REPLACEMENT_DOC}

A policy's target kind cannot be changed in place. Moving a policy from ${other.plural} to ${kind.plural} means deleting it and creating the replacement, because keeping the old rules across that move is what produces a policy that reads correctly and grants nothing.

Deactivating (\`active: false\`) is the reversible way to switch a policy off while keeping it, and is usually better than deleting it while diagnosing.

<example>
{ "access_policy_id": "6299f0b1c72f2f00181d8b3c", "active": false }
</example>

Key limitations: no partial edit of a rule list, so an unmentioned rule is lost; a rule you submit that could never match is refused before anything is written, but only as far as the permission catalog can express, not tag data on the targets themselves, and rules already stored are not re-judged when only the targets change; a rule scoped by \`tag_match\` can still stop matching when the new targets do not carry the tag, so verify a retargeted policy with get_access_policy.`,
    parameters: schema.shape,
    title: `Update ${kind.titleWord} Access Policy`,
    // Replacing a rule list irreversibly discards the rules it replaces, which is
    // the repo's definition of destructive, matching update_entity_schema.
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    mutationClass: "destructive",
    crossFieldSchema: requireAtLeastOne(
      EDITABLE_FIELDS,
      "update",
      `at least one of ${EDITABLE_FIELDS.join(", ")} must be provided alongside access_policy_id`,
      '{ "access_policy_id": "6299f0b1c72f2f00181d8b3c", "active": false }'
    ),
    tool: handler,
  };
}

const createAnalysisAccessPolicyConfigJSON = buildCreateTool(ANALYSIS);
const createRunUserAccessPolicyConfigJSON = buildCreateTool(RUN_USER);
const updateAnalysisAccessPolicyConfigJSON = buildUpdateTool(ANALYSIS);
const updateRunUserAccessPolicyConfigJSON = buildUpdateTool(RUN_USER);

export { createAnalysisAccessPolicyConfigJSON, createRunUserAccessPolicyConfigJSON, updateAnalysisAccessPolicyConfigJSON, updateRunUserAccessPolicyConfigJSON };
