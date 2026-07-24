import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { TEST_REGION, makeTestContext } from "../../../../testing/context";
import { resetAccessPolicies, storedPolicies } from "../../../../testing/mocks/am-policies";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { updateAccessPolicyConfigJSON } from "../update-access-policy";

const PROFILE_TOKEN = "p-0000000000000000000000000000000000";
const PARSER_POLICY = fixtures.accessPolicies[0].id;
const RUN_POLICY = fixtures.accessPolicies[1].id;
const DEAD_RULE_POLICY = fixtures.accessPolicies.find((policy) => policy.name === "[Run] - Already dead rule")!.id;
const ACTIONLESS_POLICY = fixtures.accessPolicies.find((policy) => policy.name === "[Analysis] - Actionless rule")!.id;
const SKIPPED_RULE_POLICY = fixtures.accessPolicies.find((policy) => policy.name === "[Analysis] - Unreadable then live")!.id;
const INERT_POLICY = fixtures.accessPolicies.find((policy) => policy.name === "[Analysis] - Inert rules")!.id;
const API = "https://api.us-e1.tago.io";

async function updatePolicy(params: Record<string, unknown>) {
  const resources = new Resources({ token: PROFILE_TOKEN, region: TEST_REGION });
  const context = makeTestContext({ resources, token: PROFILE_TOKEN, credentialKind: "profile" });
  const parsed = z.object(updateAccessPolicyConfigJSON.parameters).parse(params);
  return updateAccessPolicyConfigJSON.tool(context, parsed as never);
}

function policyById(id: string) {
  return storedPolicies().find((policy) => policy.id === id);
}

function trackRequests() {
  const requests: string[] = [];
  mockServer.events.on("request:start", ({ request }) => {
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  return requests;
}

beforeAll(() => mockServer.listen(strictListenOptions));
beforeEach(() => resetAccessPolicies());
afterEach(() => {
  mockServer.resetHandlers();
  mockServer.events.removeAllListeners();
});
afterAll(() => mockServer.close());

describe("update_access_policy replaces rule lists rather than merging", () => {
  it("replaces every rule with the ones supplied", async () => {
    expect(policyById(PARSER_POLICY)?.permissions).toHaveLength(2);

    await updatePolicy({
      access_policy_id: PARSER_POLICY,
      permissions: [{ effect: "allow", resource: "device", actions: ["get_data"] }],
    });

    // The two original rules are gone: this is replacement, not a merge, and it
    // is the tool's central hazard.
    expect(policyById(PARSER_POLICY)?.permissions).toEqual([{ effect: "allow", action: ["get_data"], resource: ["device"] }]);
  });

  it("shows the policy before and after so the replacement is visible", async () => {
    const result = await updatePolicy({
      access_policy_id: PARSER_POLICY,
      permissions: [{ effect: "allow", resource: "device", actions: ["get_data"] }],
    });

    expect(result).toContain("**Before**");
    expect(result).toContain("**After**");
    // The dropped rules appear in Before and not in After.
    const [, after] = result.split("**After**");
    expect(result).toContain("Device / Send data");
    expect(after).not.toContain("Device / Send data");
    expect(result).toContain("replaced whole");
  });

  it("renders the After view allow-first, the order the API will return", async () => {
    const result = await updatePolicy({
      access_policy_id: PARSER_POLICY,
      permissions: [
        { effect: "deny", resource: "device", actions: ["delete"] },
        { effect: "allow", resource: "device", actions: ["delete"], match: { by: "id", id: fixtures.IDS.device } },
      ],
    });

    const after = result.slice(result.indexOf("**After**"));
    expect(after.indexOf("1. ALLOW")).toBeGreaterThan(-1);
    expect(after.indexOf("2. DENY")).toBeGreaterThan(after.indexOf("1. ALLOW"));
  });

  it("leaves rules untouched when the key is absent", async () => {
    await updatePolicy({ access_policy_id: PARSER_POLICY, active: false });

    expect(policyById(PARSER_POLICY)?.permissions).toHaveLength(2);
    expect(policyById(PARSER_POLICY)?.active).toBe(false);
  });

  it("does not read the policy for a change that cannot drop rules", async () => {
    const requests = trackRequests();

    await updatePolicy({ access_policy_id: PARSER_POLICY, name: "Renamed" });

    expect(requests).toEqual([`PUT /am/${PARSER_POLICY}`]);
  });
});

describe("update_access_policy validates against the targets that will be in force", () => {
  it("checks new rules against the policy's existing targets when targets are unchanged", async () => {
    // RUN_POLICY targets run users, which cannot be granted anything on `file`.
    await expect(updatePolicy({ access_policy_id: RUN_POLICY, permissions: [{ effect: "allow", resource: "file", actions: ["upload"] }] })).rejects.toThrow(
      /cannot grant on resource `file`/
    );

    expect(policyById(RUN_POLICY)?.permissions).toEqual(fixtures.accessPolicies[1].permissions);
  });

  it("checks new rules against the new targets when both change together", async () => {
    await updatePolicy({
      access_policy_id: RUN_POLICY,
      targets: [{ type: "analysis" }],
      permissions: [{ effect: "allow", resource: "file", actions: ["upload"], match: { by: "path", path: "reports/" } }],
    });

    expect(policyById(RUN_POLICY)?.targets).toEqual([["analysis"]]);
    expect(policyById(RUN_POLICY)?.permissions).toEqual([{ effect: "allow", action: ["upload"], resource: ["file", "path", "reports/"] }]);
  });

  it("refuses a rule that cannot fire without writing anything", async () => {
    await expect(updatePolicy({ access_policy_id: PARSER_POLICY, permissions: [{ effect: "allow", resource: "device", actions: ["login_as_user"] }] })).rejects.toThrow(
      /has no action `login_as_user`/
    );

    expect(policyById(PARSER_POLICY)?.permissions).toHaveLength(2);
  });
});

describe("update_access_policy checks rules it is KEEPING against new targets", () => {
  it("refuses a targets-only change that would strand every retained rule", async () => {
    // The policy keeps device/send_data, get_data and delete. Repointing it at
    // run_user leaves those rules in place (the API only replaces a list when
    // its key is present) but run users can only be granted device/access, so
    // the policy would stay active, full of rules, and grant nothing.
    await expect(updatePolicy({ access_policy_id: PARSER_POLICY, targets: [{ type: "run_user" }] })).rejects.toThrow(
      /has no action `(send_data|get_data)`.*would be kept but stranded/s
    );

    expect(policyById(PARSER_POLICY)?.targets).toEqual(fixtures.accessPolicies[0].targets);
    expect(policyById(PARSER_POLICY)?.permissions).toHaveLength(2);
  });

  it("allows the same repoint when the rules are replaced in the same call", async () => {
    await updatePolicy({
      access_policy_id: PARSER_POLICY,
      targets: [{ type: "run_user" }],
      permissions: [{ effect: "allow", resource: "device", actions: ["access"] }],
    });

    expect(policyById(PARSER_POLICY)?.targets).toEqual([["run_user"]]);
    expect(policyById(PARSER_POLICY)?.permissions).toEqual([{ effect: "allow", action: ["access"], resource: ["device"] }]);
  });

  it("allows a targets-only change that keeps every retained rule valid", async () => {
    await updatePolicy({ access_policy_id: PARSER_POLICY, targets: [{ type: "analysis" }] });

    expect(policyById(PARSER_POLICY)?.targets).toEqual([["analysis"]]);
    expect(policyById(PARSER_POLICY)?.permissions).toHaveLength(2);
  });

  it("does not block when a rule is dead before and after for DIFFERENT reasons", async () => {
    // Dead as a run_user rule (`file` is not grantable at all) and still dead as
    // an analysis rule (`upload` rejects an `id` match). Comparing individual
    // defects would see two different reasons and wrongly call it a regression;
    // the rule was never alive, so repointing strands nothing.
    await updatePolicy({ access_policy_id: DEAD_RULE_POLICY, targets: [{ type: "analysis" }] });

    expect(policyById(DEAD_RULE_POLICY)?.targets).toEqual([["analysis"]]);
  });

  it("refuses when a rule keeps one action and silently loses another", async () => {
    // The rule grants `access` and `send_data` to an analysis. A run user can
    // be granted `access` but not `send_data`, so the rule survives while one
    // of its two grants disappears. Judging the rule as a whole would call it
    // alive and let the loss through silently.
    await updatePolicy({
      access_policy_id: PARSER_POLICY,
      targets: [{ type: "analysis" }],
      permissions: [{ effect: "allow", resource: "device", actions: ["access", "send_data"] }],
    });

    await expect(updatePolicy({ access_policy_id: PARSER_POLICY, targets: [{ type: "run_user" }] })).rejects.toThrow(/has no action `send_data`/);

    expect(policyById(PARSER_POLICY)?.targets).toEqual([["analysis"]]);
  });

  it("does not block on a rule that has no actions, which grants nothing anywhere", async () => {
    // `file` stops being grantable when the policy moves to run users, but the
    // rule lists no actions, so it granted nothing before the move either.
    // Treating it as alive-then-dead would be a false block.
    await updatePolicy({ access_policy_id: ACTIONLESS_POLICY, targets: [{ type: "run_user" }] });

    expect(policyById(ACTIONLESS_POLICY)?.targets).toEqual([["run_user"]]);
  });

  it("points the caller at the rule's position in the stored policy", async () => {
    // The inert policy's first stored rule is unreadable and is skipped by the
    // check. The reported index must still be the one get_access_policy shows,
    // not the position in the filtered list.
    const failure = await updatePolicy({ access_policy_id: SKIPPED_RULE_POLICY, targets: [{ type: "run_user" }] }).catch((error: Error) => error.message);

    expect(failure).toContain("permissions[1]");
    expect(failure).not.toContain("permissions[0]");
  });

  it("does not block an edit on a stored rule the platform itself cannot read", async () => {
    // The inert-rules policy holds a malformed tuple. It grants nothing today,
    // so it must not make the policy permanently uneditable.
    await updatePolicy({ access_policy_id: INERT_POLICY, targets: [{ type: "analysis" }] });

    expect(policyById(INERT_POLICY)?.targets).toEqual([["analysis"]]);
  });
});

describe("update_access_policy fails closed when the permission catalog cannot be read", () => {
  it("writes nothing when rules or targets are being replaced", async () => {
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: false, message: "unavailable" }, { status: 503 })));

    await expect(updatePolicy({ access_policy_id: PARSER_POLICY, targets: [{ type: "analysis" }] })).rejects.toThrow(/Permission catalog lookup failed/);

    expect(policyById(PARSER_POLICY)?.targets).toEqual(fixtures.accessPolicies[0].targets);
  });

  it("still allows a rename, which cannot strand anything", async () => {
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: false, message: "unavailable" }, { status: 503 })));

    await updatePolicy({ access_policy_id: PARSER_POLICY, name: "Renamed" });

    expect(policyById(PARSER_POLICY)?.name).toBe("Renamed");
  });
});

describe("update_access_policy reports what it changed", () => {
  it("names the changed fields", async () => {
    const result = await updatePolicy({ access_policy_id: PARSER_POLICY, name: "Renamed", active: false });

    expect(result).toContain("name, active");
    expect(policyById(PARSER_POLICY)?.name).toBe("Renamed");
  });
});
