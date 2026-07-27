import { fixtures } from "./fixtures";

/**
 * Stateful mock of the Access Management store the `/am` handlers serve.
 *
 * It reproduces the API's real semantics rather than returning canned
 * fixtures, because every tool in this domain depends on behaviour a fixture
 * would hide:
 *
 * - LIST reads only the policy table, so it returns NO `permissions` and NO
 *   `targets`. A fixture that included them would let a tool advertise fields
 *   the endpoint can never fill.
 * - INFO returns a policy's permissions re-sorted `ORDER BY effect ASC`, so
 *   every allow precedes every deny regardless of the order they were written
 *   in. Rules are evaluated last-match-wins, which is exactly why that sort
 *   matters: rendering them in submission order would misreport which rule
 *   decides.
 * - EDIT replaces the whole `permissions` and `targets` lists when the key is
 *   present and leaves them untouched when it is absent. A mock that merged
 *   would hide the tool's central hazard.
 * - CREATE and EDIT apply no arity or pairing check, so a malformed or
 *   unmatchable rule is saved and silently grants nothing. The client-side
 *   guards are the only thing preventing that, and this mock is what proves it.
 *   Tuples longer than five entries are truncated rather than kept whole,
 *   because the provider reads only positions 0 to 4.
 * - CREATE is capped by the profile's plan limit.
 */

interface StoredPermission {
  effect: string;
  action: string[];
  resource: string[];
}

interface StoredPolicy {
  id: string;
  profile: string;
  name: string;
  active: boolean;
  tags: Array<{ key: string; value: string }>;
  created_at: string;
  updated_at: string;
  targets: string[][];
  permissions: StoredPermission[];
}

/**
 * Platform `access_management` limits: 5 on free, 30 on starter, 100 on scale.
 * The mock defaults to the starter limit so seeded policies leave headroom, and
 * the free-plan value is pinned by the test that exercises the cap.
 */
const FREE_PLAN_POLICY_LIMIT = 5;
const STARTER_PLAN_POLICY_LIMIT = 30;

let policies: StoredPolicy[] = [];
let policyLimit = STARTER_PLAN_POLICY_LIMIT;
let nextId = 0;

function resetAccessPolicies() {
  policies = fixtures.accessPolicies.map((policy) => structuredClone(policy));
  policyLimit = STARTER_PLAN_POLICY_LIMIT;
  nextId = 0;
}

/** Pins the profile's plan limit for a test that exercises the cap. */
function setPolicyLimit(limit: number) {
  policyLimit = limit;
}

/** Everything currently stored, for assertions about what a call actually wrote. */
function storedPolicies(): StoredPolicy[] {
  return policies.map((policy) => structuredClone(policy));
}

/** `_buildPermission` and `_buildTargets` read positions 0 to 4 and drop the rest. */
function truncateTuples(tuples: string[][]): string[][] {
  return tuples.map((tuple) => tuple.slice(0, 5));
}

function truncatePermissions(permissions: StoredPermission[]): StoredPermission[] {
  return permissions.map((permission) => ({ ...permission, resource: (permission.resource ?? []).slice(0, 5) }));
}

function findPolicy(id: string): StoredPolicy | undefined {
  return policies.find((policy) => policy.id === id);
}

/** Deterministic 24-character id, in creation order. */
function generateId(): string {
  nextId += 1;
  return `61f00000000000000ac${String(nextId).padStart(5, "0")}`;
}

interface ListQuery {
  fields: string[];
  filter: Record<string, unknown>;
  page: number;
  amount: number;
}

/**
 * The list route selects from the policy table alone, so `permissions` and
 * `targets` are not projectable at any `fields` value.
 */
function listPolicies(query: ListQuery): Array<Record<string, unknown>> {
  const filter = query.filter ?? {};
  let matched = policies;

  if (typeof filter.name === "string") {
    const needle = filter.name.replaceAll("*", "").toLowerCase();
    matched = matched.filter((policy) => policy.name.toLowerCase().includes(needle));
  }
  if (filter.active !== undefined) {
    const wanted = String(filter.active) === "true";
    matched = matched.filter((policy) => policy.active === wanted);
  }
  if (Array.isArray(filter.tags)) {
    const wanted = filter.tags as Array<{ key?: string; value?: string }>;
    matched = matched.filter((policy) => wanted.every((tag) => policy.tags.some((stored) => stored.key === tag.key && stored.value === tag.value)));
  }

  const start = (query.page - 1) * query.amount;
  const page = matched.slice(start, start + query.amount);

  // The provider always adds id, tags, and profile to whatever was requested.
  const selectable = new Set(["id", "name", "active", "tags", "created_at", "updated_at", "profile"]);
  const fields = new Set([...query.fields.filter((field) => selectable.has(field)), "id", "tags", "profile"]);

  return page.map((policy) => {
    const row: Record<string, unknown> = {};
    for (const field of fields) {
      row[field] = policy[field as keyof StoredPolicy];
    }
    return row;
  });
}

/** Info returns rules ordered by effect: every allow, then every deny. */
function policyInfo(id: string): StoredPolicy | undefined {
  const policy = findPolicy(id);
  if (!policy) {
    return undefined;
  }
  const ordered = structuredClone(policy);
  ordered.permissions = [...policy.permissions].sort((left, right) => left.effect.localeCompare(right.effect));
  return ordered;
}

function createPolicy(body: Record<string, unknown>): { am_id: string } {
  // The API rejects only when the existing amount is GREATER than the limit
  // (`checkResourceLimit`), so a profile sitting exactly at its nominal limit
  // still accepts one more. Using `>=` here made the mock stricter than the
  // platform by one policy.
  if (policies.length > policyLimit) {
    throw new Error(`You have exceeded the maximum limit of Access management (${policyLimit}). Please upgrade you plan or contact support.`);
  }

  const now = new Date().toISOString();
  const policy: StoredPolicy = {
    id: generateId(),
    profile: fixtures.IDS.profile,
    name: String(body.name ?? ""),
    active: body.active === undefined ? true : Boolean(body.active),
    tags: Array.isArray(body.tags) ? (body.tags as StoredPolicy["tags"]) : [],
    created_at: now,
    updated_at: now,
    // No arity or pairing check, but the provider reads only tuple positions
    // 0 to 4, so anything longer is truncated rather than stored whole.
    targets: truncateTuples((body.targets as string[][]) ?? []),
    permissions: truncatePermissions((body.permissions as StoredPermission[]) ?? []),
  };

  policies.push(policy);
  return { am_id: policy.id };
}

function editPolicy(id: string, body: Record<string, unknown>): string {
  const policy = findPolicy(id);
  if (!policy) {
    throw new Error("Access Management Not Found");
  }

  if (body.name !== undefined) {
    policy.name = String(body.name);
  }
  if (body.active !== undefined) {
    policy.active = Boolean(body.active);
  }
  if (body.tags !== undefined) {
    policy.tags = body.tags as StoredPolicy["tags"];
  }
  // Wholesale replacement, not a merge: the provider deletes every row and
  // reinserts what was sent.
  if (body.permissions !== undefined) {
    policy.permissions = truncatePermissions(body.permissions as StoredPermission[]);
  }
  if (body.targets !== undefined) {
    policy.targets = truncateTuples(body.targets as string[][]);
  }
  policy.updated_at = new Date().toISOString();

  return "Access Management Successfully Updated";
}

function deletePolicy(id: string): string {
  if (!findPolicy(id)) {
    throw new Error("Access Management Not Found");
  }
  policies = policies.filter((policy) => policy.id !== id);
  return "Successfully Removed";
}

// Seeded on import so suites that never mutate policies need no setup hook.
resetAccessPolicies();

export { FREE_PLAN_POLICY_LIMIT, STARTER_PLAN_POLICY_LIMIT, createPolicy, deletePolicy, editPolicy, listPolicies, policyInfo, resetAccessPolicies, setPolicyLimit, storedPolicies };
export type { StoredPermission, StoredPolicy };
