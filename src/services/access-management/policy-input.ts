import { z } from "zod/v3";

import { invalidParamError } from "../../utils/tool-errors";
import { PermissionCatalog, TARGET_TYPES, TargetType, findGrant, grantableResources } from "./permission-catalog";
import { MatchSpec, buildMatchTuple, permissionMatchSchema, targetMatchSchema } from "./policy-rules";

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
 */

const permissionInputSchema = z.object({
  effect: z.enum(["allow", "deny"]).describe("Whether this rule grants or withholds the actions."),
  resource: z
    .string()
    .min(1)
    .describe("Resource type the rule covers, e.g. `device`, `analysis`, `file`. Call lookup_access_permissions for the resources a target kind can grant on."),
  actions: z
    .array(z.string().min(1))
    .min(1)
    .describe('Actions on that resource, e.g. `["send_data"]`. Each must be an action the resource offers to this policy\'s target kind; lookup_access_permissions lists them.'),
  match: permissionMatchSchema.optional(),
});

const targetInputSchema = z.object({
  type: z.enum(TARGET_TYPES).describe("Which kind of token the policy applies to. Access Management governs analysis and run_user tokens only; profile tokens bypass it entirely."),
  match: targetMatchSchema.optional(),
});

type PermissionInput = z.infer<typeof permissionInputSchema>;
type TargetInput = z.infer<typeof targetInputSchema>;

/** Wire form of a permission rule. `resource` is a tuple, not a bare name. */
interface PermissionWire {
  effect: "allow" | "deny";
  action: string[];
  resource: string[];
}

const DEFAULT_MATCH: MatchSpec = { by: "any" };

function toPermissionWire(input: PermissionInput): PermissionWire {
  return {
    effect: input.effect,
    action: [...input.actions],
    resource: buildMatchTuple(input.resource, input.match ?? DEFAULT_MATCH),
  };
}

function toTargetWire(input: TargetInput): string[] {
  return buildMatchTuple(input.type, input.match ?? DEFAULT_MATCH);
}

/**
 * A policy's permissions are pooled for whichever token kind matched one of its
 * targets, so a rule only has to be meaningful for ONE of the policy's target
 * kinds. A rule meaningful for none can never fire and is refused.
 */
function validatePermissions(catalog: PermissionCatalog, targetTypes: readonly TargetType[], permissions: readonly PermissionInput[]): void {
  const grantable = grantableResources(catalog, targetTypes);
  const kinds = targetTypes.join(" or ");

  for (const [index, permission] of permissions.entries()) {
    const param = `permissions[${index}]`;

    const resourceTypes = targetTypes.filter((targetType) => catalog.grants[targetType][permission.resource] !== undefined);
    if (resourceTypes.length === 0) {
      throw invalidParamError(
        param,
        `a ${kinds} policy cannot grant on resource \`${permission.resource}\`; a rule naming it would never match. Grantable resources: ${grantable.join(", ")}`,
        '{ "effect": "allow", "resource": "device", "actions": ["send_data"] }'
      );
    }

    for (const action of permission.actions) {
      const supporting = resourceTypes.filter((targetType) => findGrant(catalog, targetType, permission.resource, action) !== undefined);
      if (supporting.length === 0) {
        const offered = [...new Set(resourceTypes.flatMap((targetType) => catalog.grants[targetType][permission.resource].map((grant) => grant.action)))].sort();
        throw invalidParamError(
          param,
          `resource \`${permission.resource}\` has no action \`${action}\` for a ${kinds} target, so a rule naming it would never match. Available: ${offered.join(", ")}`,
          '{ "effect": "allow", "resource": "device", "actions": ["send_data"] }'
        );
      }

      const matchBy = permission.match?.by ?? "any";
      const accepting = supporting.filter((targetType) => findGrant(catalog, targetType, permission.resource, action)?.match_by.includes(matchBy));
      if (accepting.length === 0) {
        const accepted = [...new Set(supporting.flatMap((targetType) => findGrant(catalog, targetType, permission.resource, action)?.match_by ?? []))].sort();
        throw invalidParamError(
          `${param}.match`,
          `\`${permission.resource}\` / \`${action}\` cannot be matched by \`${matchBy}\`, so a rule using it would never match. Accepted forms: ${accepted.join(", ")}`,
          `{ "by": "${accepted[0] ?? "any"}" }`
        );
      }
    }
  }
}

export { permissionInputSchema, targetInputSchema, toPermissionWire, toTargetWire, validatePermissions };
export type { PermissionInput, PermissionWire, TargetInput };
