import { PermissionCatalog, TargetType, findGrant, grantLabel } from "./permission-catalog";
import { MatchSpec, describeMatch, parseMatchTuple } from "./policy-rules";

/**
 * Renders a policy's rules the way they are actually evaluated, and marks the
 * ones that cannot fire.
 *
 * Rules are rendered as an ordered list rather than a table on purpose. The
 * order is load-bearing (it is the evaluation order), and tag keys and values
 * are free-form user text that the shared markdown table renderer does not
 * escape, so a value containing a pipe would silently render as a different
 * rule.
 */

/** How a policy arrives from the API. `permissions[].resource` is a tuple, not a name. */
interface PolicyWire {
  id?: string;
  name?: string;
  active?: boolean;
  tags?: Array<{ key: string; value: string }>;
  created_at?: unknown;
  updated_at?: unknown;
  targets?: string[][];
  permissions?: Array<{ effect?: string; action?: string[]; resource?: string[] }>;
}

const EVALUATION_NOTE = [
  "How these are evaluated: a request is denied unless a rule matches it, and when several match, the last one in this list wins.",
  "The API returns a policy's rules with every allow before every deny, so inside ONE policy a matching deny beats a matching allow.",
  "Across policies it defines no order, so do not rely on a deny in one policy overriding an allow in another; keep both rules in the same policy instead.",
].join(" ");

const TARGET_NOUNS: Record<TargetType, string> = { analysis: "analysis", run_user: "run user" };

/** Reasons an action within a rule can never fire, given the policy's targets. */
function inertReasons(catalog: PermissionCatalog, targetTypes: readonly TargetType[], resource: string, actions: string[], match: MatchSpec): string[] {
  const reasons: string[] = [];
  const resourceTypes = targetTypes.filter((targetType) => catalog.grants[targetType][resource] !== undefined);

  if (resourceTypes.length === 0) {
    return [`this policy's target kind cannot be granted anything on \`${resource}\``];
  }

  for (const action of actions) {
    const supporting = resourceTypes.filter((targetType) => findGrant(catalog, targetType, resource, action) !== undefined);
    if (supporting.length === 0) {
      reasons.push(`\`${resource}\` has no action \`${action}\``);
      continue;
    }
    if (!supporting.some((targetType) => findGrant(catalog, targetType, resource, action)?.match_by.includes(match.by))) {
      reasons.push(`\`${resource}\` / \`${action}\` cannot be matched by \`${match.by}\``);
    }
  }

  return reasons;
}

function renderTargets(targets: string[][]): { lines: string[]; types: TargetType[] } {
  const lines: string[] = [];
  const types = new Set<TargetType>();

  for (const tuple of targets) {
    const kind = tuple[0];
    const match = parseMatchTuple(tuple);

    if (kind !== "analysis" && kind !== "run_user") {
      lines.push(`- \`${kind}\` (INERT: only \`analysis\` and \`run_user\` tokens are governed by Access Management)`);
      continue;
    }
    types.add(kind);

    if (!match) {
      lines.push(`- ${TARGET_NOUNS[kind]} (INERT: the stored target is malformed, so this policy applies to nothing)`);
      continue;
    }
    if (match.by === "path") {
      lines.push(`- ${TARGET_NOUNS[kind]} (INERT: targets cannot be matched by path)`);
      continue;
    }
    lines.push(`- ${describeMatch(TARGET_NOUNS[kind], match)}`);
  }

  return { lines, types: [...types] };
}

function renderRules(permissions: NonNullable<PolicyWire["permissions"]>, targetTypes: readonly TargetType[], catalog?: PermissionCatalog): string[] {
  return permissions.map((permission, index) => {
    const effect = (permission.effect ?? "allow").toUpperCase();
    const tuple = permission.resource ?? [];
    const actions = permission.action ?? [];
    const match = parseMatchTuple(tuple);
    const position = index + 1;

    if (!match) {
      return `${position}. ${effect} \`${actions.join("`, `")}\` on \`${tuple.join(" ")}\` (INERT: the stored resource is malformed, so this rule never matches)`;
    }

    const resource = tuple[0];
    const labels = catalog ? actions.map((action) => grantLabel(catalog, targetTypes[0] ?? "analysis", resource, action)) : actions.map((action) => `${resource} / ${action}`);
    const line = `${position}. ${effect} ${labels.join(", ")} on ${describeMatch(resource, match)}`;

    if (!catalog) {
      return line;
    }
    const reasons = inertReasons(catalog, targetTypes, resource, actions, match);
    return reasons.length > 0 ? `${line} (INERT: ${reasons.join("; ")})` : line;
  });
}

/** Full decoded view of one policy, used by get_access_policy and by the update confirmation. */
function renderPolicyRules(policy: PolicyWire, catalog?: PermissionCatalog): string {
  const { lines: targetLines, types } = renderTargets(policy.targets ?? []);
  const sections: string[] = [];

  sections.push("**Applies to**");
  sections.push(targetLines.length > 0 ? targetLines.join("\n") : "- nothing: this policy has no targets, so it grants nothing.");
  sections.push("");

  const permissions = policy.permissions ?? [];
  sections.push("**Rules**");
  sections.push(permissions.length > 0 ? renderRules(permissions, types, catalog).join("\n") : "- none: this policy has no rules, so it grants nothing.");
  sections.push("");
  sections.push(EVALUATION_NOTE);

  return sections.join("\n");
}

export { EVALUATION_NOTE, renderPolicyRules, renderRules, renderTargets };
export type { PolicyWire };
