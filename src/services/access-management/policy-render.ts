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

/**
 * The platform has more than one evaluator, and they resolve a cross-policy
 * deny differently, so a single blanket statement is wrong either way.
 *
 * Listing goes through a SQL filter built as `allow AND NOT deny`
 * (`providers/db-functions/am-parser.ts`), which is set algebra: every deny
 * applies, whatever policy holds it and in any order. Authorizing one operation
 * on one resource goes through `matchAMPermissions`, a last-match-wins loop over
 * permissions pooled from each matching policy in unspecified row order, so
 * there a deny in another policy may or may not fire. Only the same-policy case
 * is reliable on both.
 */
const EVALUATION_NOTE = [
  "How these are evaluated: a request is denied unless a rule matches it, and this policy's rules are returned with every allow before every deny, so within ONE policy a matching deny beats a matching allow.",
  "Across policies the answer depends on what is being asked.",
  "When the platform LISTS resources, it takes what the matching policies allow and then removes anything any of them denies, so a deny always applies no matter which policy holds it.",
  "When it checks a SINGLE operation on one resource, the last matching rule wins and the order policies are pooled in is unspecified, so a deny in a different policy may or may not take effect.",
  "Keeping a deny in the same policy as the allow it limits is reliable in both cases.",
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
function renderTargets(targets: string[][]): { lines: string[]; types: TargetType[]; subsumed: TargetType[]; resolved: number } {
  const lines: string[] = [];
  const types = new Set<TargetType>();
  const covers = { analysis: { any: false, narrower: false }, run_user: { any: false, narrower: false } };
  // Counted separately from `lines`, because an INERT entry still renders a line
  // and selects nothing. Anything reasoning about what the policy covers has to
  // count what resolves, not what is printed.
  let resolved = 0;

  for (const tuple of targets) {
    const kind = tuple[0];
    const match = parseMatchTuple(tuple);

    if (kind !== "analysis" && kind !== "run_user") {
      lines.push(`- \`${kind}\` (INERT: only \`analysis\` and \`run_user\` tokens are governed by Access Management)`);
      continue;
    }
    if (!match) {
      lines.push(`- ${TARGET_NOUNS[kind]} (INERT: this target is stored malformed, so it selects nothing)`);
      continue;
    }
    if (match.by === "path") {
      lines.push(`- ${TARGET_NOUNS[kind]} (INERT: targets cannot be matched by path, so this entry selects nothing)`);
      continue;
    }

    types.add(kind);
    resolved += 1;
    if (match.by === "any") {
      covers[kind].any = true;
    } else {
      covers[kind].narrower = true;
    }
    lines.push(`- ${describeMatch(TARGET_NOUNS[kind], match)}`);
  }

  // A kind matched by `any` alongside narrower entries applies to every token of
  // that kind, and the narrower lines are then decoration. Read top-down they
  // suggest a scope the policy does not have.
  const subsumed = (Object.keys(covers) as TargetType[]).filter((kind) => covers[kind].any && covers[kind].narrower);

  return { lines, types: [...types], subsumed, resolved };
}

/**
 * The kinds of token a stored policy actually applies to.
 *
 * A malformed target selects no policy, so its kind does not count; an empty
 * result means the policy currently grants nothing to anyone.
 */
function targetKindsOf(targets: readonly string[][]): TargetType[] {
  return renderTargets([...targets]).types;
}

/**
 * A policy holding both kinds of target grants its WHOLE rule list to both.
 *
 * The API validates each target on its own and never correlates a target to the
 * rules beside it, and evaluation pools a matched policy's entire rule list
 * without filtering by kind. Five resources exist in both catalogs (`device`,
 * `entity`, `dashboard`, `run_user`, `sql`), so a rule written for the analysis
 * silently reaches the co-targeted run users too, and the reverse.
 *
 * These tools cannot produce one, and neither can the platform's own agent
 * tooling, which binds the kind the same way. It is reachable from a direct
 * `POST`/`PUT /am` call, so a policy that arrived by any other route may hold
 * both kinds and this is worth naming when it does.
 */
const MIXED_TARGET_CONSEQUENCE = [
  "Its rules are not split between the two: every rule applies to whichever kind matched.",
  "So any rule naming a resource AND action that both kinds can be granted reaches both, which is rarely what was intended.",
  "The shared resource names are `device`, `entity`, `dashboard`, `run_user` and `sql`, but their action sets differ, so check the pairing with lookup_access_permissions rather than assuming every rule on those crosses over.",
  "Either update tool can still rename this policy, retag it, or set `active: false` to switch it off reversibly.",
  "Neither will replace its targets, since that resolves it to one kind and drops the other, and neither will replace its rules, since a tool that owns one kind cannot safely author rules for both.",
  "To split it properly, create one policy per kind and then delete this one.",
].join(" ");

const MIXED_TARGET_WARNING = `**This policy targets BOTH an analysis and a TagoRUN user.** ${MIXED_TARGET_CONSEQUENCE}`;

/**
 * A policy whose every rule is a deny adds nothing.
 *
 * Evaluation starts denied and each matching rule overwrites the verdict, so a
 * deny only changes an outcome when an allow matched BEFORE it. That ordering
 * is guaranteed only within one policy, since the provider sorts each policy's
 * rules `ORDER BY effect ASC` and the pooled list across policies is a plain
 * concatenation in unspecified row order. The wording deliberately claims only
 * what holds either way, so it stays true if the platform ever sorts the pooled
 * list globally.
 */
const DENY_ONLY_NOTE = [
  "**This policy has no ALLOW rule**, so it grants nothing by itself and can only narrow what another policy allows.",
  "That is reliable where the platform lists resources, since every deny applies there whatever policy holds it.",
  "It is not reliable where the platform checks a single operation, since the last matching rule wins and the order policies are pooled in is unspecified.",
  "Putting the deny in the same policy as the allow it limits works in both cases.",
].join(" ");

/**
 * Multiple targets are alternatives, which the rules section says of rules and
 * nothing said of targets. Named per kind, because the write tools each own one
 * and naming both there would describe a policy they cannot produce.
 */
function targetAlternativesNote(kinds: readonly TargetType[]): string {
  const nouns = kinds.length > 0 ? kinds.map((kind) => `${TARGET_NOUNS[kind] === "analysis" ? "An" : "A"} ${TARGET_NOUNS[kind]}`).join(" or ") : "An analysis or run user";
  return `${nouns} matching ANY line above is covered by this policy.`;
}

function subsumedTargetNote(kinds: readonly TargetType[], narrowerCount: number): string {
  const nouns = kinds.map((kind) => `any ${TARGET_NOUNS[kind]}`).join(" and ");
  const entries = narrowerCount === 1 ? "the narrower entry" : "the narrower entries";
  const qualifier = kinds.length > 1 ? "" : " of that kind";
  return `Note: this policy covers ${nouns}, so ${entries}${qualifier} above adds nothing and the scope is wider than the list suggests.`;
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
  const { lines: targetLines, types, subsumed, resolved } = renderTargets(policy.targets ?? []);
  const sections: string[] = [];

  sections.push("**Applies to**");
  sections.push(targetLines.length > 0 ? targetLines.join("\n") : "- nothing: this policy has no targets, so it grants nothing.");
  // Targets are alternatives. Gated on how many RESOLVE, not on how many lines
  // print: an INERT entry renders a line and selects nothing, so counting lines
  // would announce coverage directly beneath entries that say they cover nothing.
  if (resolved > 1) {
    sections.push("");
    sections.push(targetAlternativesNote(types));
  }
  if (subsumed.length > 0) {
    sections.push("");
    sections.push(subsumedTargetNote(subsumed, resolved - subsumed.length));
  }
  sections.push("");
  if (types.length > 1) {
    sections.push(MIXED_TARGET_WARNING);
    sections.push("");
  }

  const permissions = policy.permissions ?? [];
  sections.push("**Rules**");
  sections.push(permissions.length > 0 ? renderRules(permissions, types, catalog).join("\n") : "- none: this policy has no rules, so it grants nothing.");
  // A rule list that is entirely denies is individually valid and collectively
  // pointless, which is the rule-level INERT problem one level up.
  if (permissions.length > 0 && permissions.every((permission) => permission.effect === "deny")) {
    sections.push("");
    sections.push(DENY_ONLY_NOTE);
  }
  sections.push("");
  sections.push(EVALUATION_NOTE);

  return sections.join("\n");
}

export { EVALUATION_NOTE, MIXED_TARGET_CONSEQUENCE, MIXED_TARGET_WARNING, orderLikeApi, renderPolicyRules, renderRules, renderTargets, targetKindsOf };
export type { PolicyRule, PolicyWire };
