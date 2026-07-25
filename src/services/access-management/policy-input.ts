import { z } from "zod/v3";

import { invalidParamError, invalidParamMessage } from "../../utils/tool-errors";
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

type PermissionInput = z.infer<typeof permissionInputSchema> & {
  /** Position in the stored policy, when these rules were read back from one and unreadable entries were dropped. */
  sourceIndex?: number;
};
type TargetInput = z.infer<typeof targetInputSchema>;

/** Wire form of a permission rule. `resource` is a tuple, not a bare name. */
interface PermissionWire {
  effect: "allow" | "deny";
  action: string[];
  resource: string[];
}

const DEFAULT_MATCH: MatchSpec = { by: "any" };

function exampleRule(resource: string, action: string): string {
  return `{ "effect": "allow", "resource": "${resource}", "actions": ["${action}"] }`;
}

/** Used only when the catalog offers nothing to derive an example from. */
const FALLBACK_EXAMPLE_RULE = exampleRule("device", "send_data");

/**
 * An example rule naming a resource and action the given target kinds really
 * offer. A hardcoded example can name a pairing the same message just refused,
 * which sends the caller round the same rejection again.
 *
 * `device` is preferred when it is grantable, because it is the canonical case
 * and safe to suggest. Taking the first resource in sorted order instead would
 * offer `access_management` to an analysis, telling a confused caller to grant
 * the policy engine itself away.
 */
function deriveExampleRule(catalog: PermissionCatalog, targetTypes: readonly TargetType[], grantable: readonly string[]): string {
  const preferred = grantable.includes("device") ? ["device", ...grantable] : grantable;
  for (const resource of preferred) {
    for (const targetType of targetTypes) {
      const [grant] = catalog.grants[targetType][resource] ?? [];
      if (grant !== undefined) {
        return exampleRule(resource, grant.action);
      }
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

function toTargetWire(input: TargetInput): string[] {
  return buildMatchTuple(input.type, input.match ?? DEFAULT_MATCH);
}

/** One reason a rule cannot fire, tied to the rule it came from. */
interface PermissionProblem {
  /** Position in the list that was checked. */
  rule: number;
  /** Position in the caller's own list, which differs when unreadable rules were filtered out. */
  reportedRule: number;
  /** The action at fault, absent when the whole resource is. */
  action?: string;
  message: string;
}

/**
 * Every reason the given rules could not fire under the given target kinds.
 *
 * A policy's rules are pooled for whichever token kind matched one of its
 * targets, so a rule only has to be meaningful for ONE of them; a rule
 * meaningful for none can never fire.
 */
function collectPermissionProblems(catalog: PermissionCatalog, targetTypes: readonly TargetType[], permissions: readonly PermissionInput[]): PermissionProblem[] {
  const problems: PermissionProblem[] = [];
  const grantable = grantableResources(catalog, targetTypes);
  const kinds = targetTypes.join(" or ");

  for (const [index, permission] of permissions.entries()) {
    // Rules read back from a policy may have had unreadable entries filtered
    // out, so the position to report is the one the caller can see, not ours.
    const reportedRule = permission.sourceIndex ?? index;
    const param = `permissions[${reportedRule}]`;

    const resourceTypes = targetTypes.filter((targetType) => catalog.grants[targetType][permission.resource] !== undefined);
    if (resourceTypes.length === 0) {
      problems.push({
        rule: index,
        reportedRule,
        message: invalidParamMessage(
          param,
          `${kinds} policies cannot grant on resource \`${permission.resource}\`; a rule naming it would never match. Grantable resources: ${grantable.join(", ")}`,
          deriveExampleRule(catalog, targetTypes, grantable)
        ),
      });
      continue;
    }

    for (const action of permission.actions) {
      const supporting = resourceTypes.filter((targetType) => findGrant(catalog, targetType, permission.resource, action) !== undefined);
      if (supporting.length === 0) {
        const offered = [...new Set(resourceTypes.flatMap((targetType) => catalog.grants[targetType][permission.resource].map((grant) => grant.action)))].sort();
        problems.push({
          rule: index,
          reportedRule,
          action,
          message: invalidParamMessage(
            param,
            `resource \`${permission.resource}\` has no action \`${action}\` for ${kinds} targets, so a rule naming it would never match. Available: ${offered.join(", ")}`,
            // Non-empty by construction: the resource is in the catalog for at
            // least one of these kinds, and only resources with a grant are stored.
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
      const judgeable = supporting.filter((targetType) => (findGrant(catalog, targetType, permission.resource, action)?.match_by.length ?? 0) > 0);
      const accepting = judgeable.filter((targetType) => findGrant(catalog, targetType, permission.resource, action)?.match_by.includes(matchBy));
      // Every supporting grant must be judgeable before an action is called
      // dead. One that lists no match forms leaves the answer unknown, and
      // unknown is not dead.
      if (judgeable.length === supporting.length && accepting.length === 0) {
        const accepted = [...new Set(judgeable.flatMap((targetType) => findGrant(catalog, targetType, permission.resource, action)?.match_by ?? []))].sort();
        problems.push({
          rule: index,
          reportedRule,
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

function assertResolvableTargets(targetTypes: readonly TargetType[]): void {
  if (targetTypes.length === 0) {
    throw invalidParamError(
      "targets",
      "the policy has no analysis or run_user target the platform can resolve, so no rule on it could ever match. Give it at least one target",
      '[{ "type": "analysis", "match": { "by": "id", "id": "6299f0b1c72f2f00181d8b3c" } }]'
    );
  }
}

/** Refuses rules that could never fire. Used where every rule is newly submitted. */
function validatePermissions(catalog: PermissionCatalog, targetTypes: readonly TargetType[], permissions: readonly PermissionInput[]): void {
  assertResolvableTargets(targetTypes);
  const [problem] = collectPermissionProblems(catalog, targetTypes, permissions);
  if (problem) {
    throw new Error(problem.message);
  }
}

/**
 * Which individual grants can fire under the given targets, as `rule:action`.
 *
 * Liveness is per action, not per rule. A repoint that leaves a rule with one
 * working action out of three has still silently taken two away, and that is
 * the same silent partial loss the renderer reports as PARTLY INERT. A rule
 * listing no actions contributes nothing, so it can never be stranded.
 */
function liveGrants(catalog: PermissionCatalog, targetTypes: readonly TargetType[], permissions: readonly PermissionInput[]): Set<string> {
  const problemsByRule = new Map<number, { resource: boolean; actions: Set<string> }>();
  for (const problem of collectPermissionProblems(catalog, targetTypes, permissions)) {
    const bucket = problemsByRule.get(problem.rule) ?? { resource: false, actions: new Set<string>() };
    if (problem.action === undefined) {
      bucket.resource = true;
    } else {
      bucket.actions.add(problem.action);
    }
    problemsByRule.set(problem.rule, bucket);
  }

  const live = new Set<string>();
  for (const [index, permission] of permissions.entries()) {
    const problems = problemsByRule.get(index);
    if (problems?.resource) {
      continue;
    }
    for (const action of permission.actions) {
      if (!problems?.actions.has(action)) {
        live.add(`${index}\u0000${action}`);
      }
    }
  }
  return live;
}

/**
 * Refuses the grants a target change would newly kill.
 *
 * Compared per action and by liveness rather than by the reason for deadness.
 * A grant already dead must not block an unrelated edit, or a policy that
 * contains one becomes permanently uneditable, and comparing the reasons is the
 * wrong abstraction: the same action can be dead before because its match form
 * is rejected and dead after because the action does not exist, which is not a
 * regression even though the reasons differ. Only live-then-dead is.
 *
 * This sees only what the permission catalog can express. A rule scoped by
 * `tag_match` can still stop matching at runtime when the new targets do not
 * carry the tag, because that depends on the targets' own data rather than on
 * the catalog. The tool says what it checks rather than claiming more.
 */
function validateRetainedPermissions(
  catalog: PermissionCatalog,
  previousTargetTypes: readonly TargetType[],
  nextTargetTypes: readonly TargetType[],
  permissions: readonly PermissionInput[]
): void {
  assertResolvableTargets(nextTargetTypes);

  const liveBefore = liveGrants(catalog, previousTargetTypes, permissions);
  const liveAfter = liveGrants(catalog, nextTargetTypes, permissions);
  const stranded = [...liveBefore]
    .filter((grant) => !liveAfter.has(grant))
    .map((grant) => {
      const [rule, action] = grant.split("\u0000");
      return { rule: Number(rule), action };
    })
    .sort((left, right) => left.rule - right.rule || left.action.localeCompare(right.action));

  if (stranded.length === 0) {
    return;
  }

  const { rule, action } = stranded[0];
  const problems = collectPermissionProblems(catalog, nextTargetTypes, permissions);
  // Exhaustive by construction: a strand is caused either by a problem naming
  // the action, or by a resource problem, which is the rule's only problem.
  const problem = problems.find((entry) => entry.rule === rule && entry.action === action) ?? problems.find((entry) => entry.rule === rule);
  const fallback = invalidParamMessage(
    `permissions[${permissions[rule]?.sourceIndex ?? rule}]`,
    `\`${action}\` could not fire under the new targets`,
    deriveExampleRule(catalog, nextTargetTypes, grantableResources(catalog, nextTargetTypes))
  );
  throw new Error(
    `${problem?.message ?? fallback} That grant works under the policy's current targets and would not under the new ones, so it would be kept but stranded. Pass \`permissions\` in the same call to replace it.`
  );
}

export { collectPermissionProblems, permissionInputSchema, targetInputSchema, toPermissionWire, toTargetWire, validatePermissions, validateRetainedPermissions };
export type { PermissionInput, PermissionWire, TargetInput };
