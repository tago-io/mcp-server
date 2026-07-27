import { z } from "zod/v3";

import { invalidParamError, invalidParamMessage } from "../../utils/tool-errors";
import { PermissionCatalog, TargetType, findGrant, grantableResources } from "./permission-catalog";
import { MatchSpec, buildMatchTuple, permissionMatchSchema } from "./policy-rules";

/**
 * Tool-facing shapes for a policy's rules, and the checks that stop a policy
 * the API would store but never honour.
 *
 * The API validates a permission's `resource` and `action` independently, so
 * `{resource: ["device"], action: ["login_as_user"]}` is accepted, saved, and
 * silently inert: evaluation only ever asks a device for device actions. The
 * same is true of a match form a grant does not accept, such as scoping device
 * CREATE to a single device id when no device exists yet to carry it. Both
 * produce the failure this domain was opened to make diagnosable, so both are
 * refused here rather than written.
 *
 * Everything here is judged against ONE target kind, because the write tools
 * are split by kind and each binds its own. A rule only has to be meaningful
 * for the kind of token the policy applies to.
 */

const permissionInputSchema = z.object({
  effect: z.enum(["allow", "deny"]).describe("Whether this rule grants or withholds the actions."),
  resource: z
    .string()
    .min(1)
    .describe("Resource type the rule covers, e.g. `device`, `analysis`, `file`. Call lookup_access_permissions for the resources this kind of policy can grant on."),
  actions: z
    .array(z.string().min(1))
    .min(1)
    .describe('Actions on that resource, e.g. `["send_data"]`. Each must be an action the resource offers to this kind of policy; lookup_access_permissions lists them.'),
  match: permissionMatchSchema.optional(),
});

type PermissionInput = z.infer<typeof permissionInputSchema>;

/** Wire form of a permission rule. `resource` is a tuple, not a bare name. */
interface PermissionWire {
  effect: "allow" | "deny";
  action: string[];
  resource: string[];
}

/** "an analysis" but "a run_user". The article was hardcoded and read wrong for one of the two kinds. */
function aPolicyOf(targetType: TargetType): string {
  return `${/^[aeiou]/i.test(targetType) ? "an" : "a"} \`${targetType}\` policy`;
}

const DEFAULT_MATCH: MatchSpec = { by: "any" };

function exampleRule(resource: string, action: string): string {
  return `{ "effect": "allow", "resource": "${resource}", "actions": ["${action}"] }`;
}

/** Used only when the catalog offers nothing to derive an example from. */
const FALLBACK_EXAMPLE_RULE = exampleRule("device", "send_data");

/**
 * An example rule naming a resource and action this target kind really offers.
 * A hardcoded example can name a pairing the same message just refused, which
 * sends the caller round the same rejection again.
 *
 * `device` is preferred when it is grantable, because it is the canonical case
 * and safe to suggest. Taking the first resource in sorted order instead would
 * offer `access_management` to an analysis, telling a confused caller to grant
 * the policy engine itself away.
 */
function deriveExampleRule(catalog: PermissionCatalog, targetType: TargetType, grantable: readonly string[]): string {
  const preferred = grantable.includes("device") ? ["device", ...grantable] : grantable;
  for (const resource of preferred) {
    const [grant] = catalog.grants[targetType][resource] ?? [];
    if (grant !== undefined) {
      return exampleRule(resource, grant.action);
    }
  }
  return FALLBACK_EXAMPLE_RULE;
}

function toPermissionWire(input: PermissionInput): PermissionWire {
  return {
    effect: input.effect,
    action: [...input.actions],
    resource: buildMatchTuple(input.resource, input.match ?? DEFAULT_MATCH),
  };
}

function toTargetWire(targetType: TargetType, match: MatchSpec): string[] {
  return buildMatchTuple(targetType, match);
}

/** One reason a rule cannot fire under a given target kind. */
interface PermissionProblem {
  /** Position in the submitted list. */
  rule: number;
  /** The action at fault, absent when the whole resource is. */
  action?: string;
  message: string;
}

/** Every reason the given rules could not fire for the given kind of token. */
function collectPermissionProblems(catalog: PermissionCatalog, targetType: TargetType, permissions: readonly PermissionInput[]): PermissionProblem[] {
  const problems: PermissionProblem[] = [];
  const grantable = grantableResources(catalog, targetType);

  for (const [index, permission] of permissions.entries()) {
    const param = `permissions[${index}]`;
    const offeredGrants = catalog.grants[targetType][permission.resource];

    if (offeredGrants === undefined) {
      problems.push({
        rule: index,
        message: invalidParamMessage(
          param,
          `${aPolicyOf(targetType)} cannot grant on resource \`${permission.resource}\`; a rule naming it would never match. Grantable resources: ${grantable.join(", ")}`,
          deriveExampleRule(catalog, targetType, grantable)
        ),
      });
      continue;
    }

    for (const action of permission.actions) {
      const grant = findGrant(catalog, targetType, permission.resource, action);
      if (grant === undefined) {
        const offered = [...new Set(offeredGrants.map((entry) => entry.action))].sort();
        problems.push({
          rule: index,
          action,
          message: invalidParamMessage(
            param,
            `resource \`${permission.resource}\` has no action \`${action}\` for ${aPolicyOf(targetType)}, so a rule naming it would never match. Available: ${offered.join(", ")}`,
            // Non-empty by construction: the resource is only stored in the
            // catalog when it offers at least one grant.
            exampleRule(permission.resource, offered[0])
          ),
        });
        continue;
      }

      const matchBy = permission.match?.by ?? "any";
      // A grant that arrives without match forms cannot be judged, so it is
      // accepted rather than refused on an absent field. Refusing would produce
      // an unsatisfiable error, and this is exactly the catalog drift the
      // fetch-rather-than-vendor design exists to survive.
      if (grant.match_by.length > 0 && !grant.match_by.includes(matchBy)) {
        const accepted = [...grant.match_by].sort();
        problems.push({
          rule: index,
          action,
          message: invalidParamMessage(
            `${param}.match`,
            `\`${permission.resource}\` / \`${action}\` cannot be matched by \`${matchBy}\`, so a rule using it would never match. Accepted forms: ${accepted.join(", ")}`,
            `{ "by": "${accepted[0] ?? "any"}" }`
          ),
        });
      }
    }
  }

  return problems;
}

/**
 * Refuses rules assigned to a policy the platform can match to no token.
 *
 * A create always supplies targets, so this only bites an update that replaces
 * the rules of a policy whose stored targets are malformed or absent. Writing
 * rules to it produces a policy that reads correctly and grants nothing, which
 * is the artefact this domain exists to prevent, so the caller is told to send
 * `targets` in the same call.
 */
function assertResolvableTargets(targetType: TargetType, targetKinds: readonly TargetType[]): void {
  if (targetKinds.length === 0) {
    throw invalidParamError(
      "targets",
      "this policy has no target the platform can resolve, so no rule on it could ever match. Send `targets` in the same call as the rules",
      `[{ "by": "id", "id": "6299f0b1c72f2f00181d8b3c" }] (each one ${targetType === "analysis" ? "an analysis" : "a TagoRUN user"})`
    );
  }
}

/** Refuses rules that could never fire for this kind of token. */
function validatePermissions(catalog: PermissionCatalog, targetType: TargetType, permissions: readonly PermissionInput[]): void {
  const [problem] = collectPermissionProblems(catalog, targetType, permissions);
  if (problem) {
    throw new Error(problem.message);
  }
}

export { assertResolvableTargets, collectPermissionProblems, permissionInputSchema, toPermissionWire, toTargetWire, validatePermissions };
export type { PermissionInput, PermissionWire };
