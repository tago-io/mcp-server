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

type PolicyRule = NonNullable<PolicyWire["permissions"]>[number];

const EVALUATION_NOTE = [
  "How these are evaluated: a request is denied unless a rule matches it, and when several match, the last one in this list wins.",
  "The API returns a policy's rules with every allow before every deny, so inside ONE policy a matching deny beats a matching allow.",
  "Across policies it defines no order, so do not rely on a deny in one policy overriding an allow in another; keep both rules in the same policy instead.",
].join(" ");

const TARGET_NOUNS: Record<TargetType, string> = { analysis: "analysis", run_user: "run user" };

/**
 * Puts locally built rules in the order the API will report and evaluate them.
 *
 * A read already arrives sorted, because the provider selects a policy's rules
 * `ORDER BY effect ASC` and the same function backs both the info route and the
 * authorization path. A rule list we assembled ourselves has not been through
 * that sort yet, so rendering it as submitted would show an order the platform
 * never evaluates in: submitting deny-then-allow would read as "allow wins"
 * under a note saying the last match decides, when the deny actually fires
 * last. Only allow and deny can occur, so this is a two-way split rather than
 * a string comparison. Sorting is stable, so rules sharing an effect keep
 * their order, which is all the API defines within a group anyway.
 */
function orderLikeApi(permissions: readonly PolicyRule[]): PolicyRule[] {
  const effectOf = (rule: PolicyRule) => (rule.effect === "deny" ? 1 : 0);
  return [...permissions].sort((left, right) => effectOf(left) - effectOf(right));
}

/** Reasons a rule cannot fire, per action, given the policy's targets. */
function inertReasons(
  catalog: PermissionCatalog,
  targetTypes: readonly TargetType[],
  resource: string,
  actions: string[],
  match: MatchSpec
): { reasons: string[]; whollyInert: boolean } {
  if (actions.length === 0) {
    return { reasons: ["the rule lists no actions"], whollyInert: true };
  }

  const resourceTypes = targetTypes.filter((targetType) => catalog.grants[targetType][resource] !== undefined);
  if (resourceTypes.length === 0) {
    return { reasons: [`this policy's targets cannot be granted anything on \`${resource}\``], whollyInert: true };
  }

  const reasons: string[] = [];
  let liveActions = 0;

  for (const action of actions) {
    const supporting = resourceTypes.filter((targetType) => findGrant(catalog, targetType, resource, action) !== undefined);
    if (supporting.length === 0) {
      reasons.push(`\`${resource}\` has no action \`${action}\``);
      continue;
    }
    // Every supporting grant must be judgeable before an action is called dead.
    // One that lists no match forms leaves the answer unknown, and unknown is
    // not dead.
    const judgeable = supporting.filter((targetType) => (findGrant(catalog, targetType, resource, action)?.match_by.length ?? 0) > 0);
    if (judgeable.length === supporting.length && !judgeable.some((targetType) => findGrant(catalog, targetType, resource, action)?.match_by.includes(match.by))) {
      reasons.push(`\`${resource}\` / \`${action}\` cannot be matched by \`${match.by}\``);
      continue;
    }
    liveActions += 1;
  }

  return { reasons, whollyInert: liveActions === 0 };
}

/**
 * A target only contributes its kind once it is one the platform resolves. A
 * malformed target selects no policy at all, so counting its kind would let it
 * vouch for rules that can never be reached through it.
 */
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
    if (!match) {
      lines.push(`- ${TARGET_NOUNS[kind]} (INERT: the stored target is malformed, so this policy applies to nothing)`);
      continue;
    }
    if (match.by === "path") {
      lines.push(`- ${TARGET_NOUNS[kind]} (INERT: targets cannot be matched by path)`);
      continue;
    }

    types.add(kind);
    lines.push(`- ${describeMatch(TARGET_NOUNS[kind], match)}`);
  }

  return { lines, types: [...types] };
}

/** The grant's console name, from whichever target kind actually offers it. */
function labelFor(catalog: PermissionCatalog, targetTypes: readonly TargetType[], resource: string, action: string): string {
  const owner = targetTypes.find((targetType) => findGrant(catalog, targetType, resource, action) !== undefined);
  return grantLabel(catalog, owner ?? targetTypes[0] ?? "analysis", resource, action);
}

function renderRules(permissions: readonly PolicyRule[], targetTypes: readonly TargetType[], catalog?: PermissionCatalog): string[] {
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
    const labels = catalog ? actions.map((action) => labelFor(catalog, targetTypes, resource, action)) : actions.map((action) => `${resource} / ${action}`);
    const subject = labels.length > 0 ? `${labels.join(", ")} on ` : "";
    const line = `${position}. ${effect} ${subject}${describeMatch(resource, match)}`;

    // Without a catalog the pairing cannot be judged; without a resolvable
    // target the "Applies to" section already says the policy grants nothing,
    // and repeating that per rule would bury the real cause.
    if (!catalog || targetTypes.length === 0) {
      return line;
    }

    const { reasons, whollyInert } = inertReasons(catalog, targetTypes, resource, actions, match);
    if (reasons.length === 0) {
      return line;
    }
    return `${line} (${whollyInert ? "INERT" : "PARTLY INERT"}: ${reasons.join("; ")})`;
  });
}

/** Full decoded view of one policy, used by get_access_policy and by the write confirmations. */
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

export { EVALUATION_NOTE, orderLikeApi, renderPolicyRules, renderRules, renderTargets };
export type { PolicyRule, PolicyWire };
