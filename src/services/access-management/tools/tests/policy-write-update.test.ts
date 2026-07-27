import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { TEST_REGION, makeTestContext } from "../../../../testing/context";
import { editPolicy, resetAccessPolicies, storedPolicies } from "../../../../testing/mocks/am-policies";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { IToolConfig } from "../../../types";
import { updateAnalysisAccessPolicyConfigJSON, updateRunUserAccessPolicyConfigJSON } from "../policy-write";

const PROFILE_TOKEN = "p-0000000000000000000000000000000000";
const API = "https://api.us-e1.tago.io";
const ANALYSIS_POLICY = fixtures.accessPolicies[0].id;
const RUN_POLICY = fixtures.accessPolicies[1].id;
const MIXED = fixtures.accessPolicies.find((policy) => policy.name === "[Mixed] - Analysis and run user")!;
const MIXED_POLICY = MIXED.id;

async function callUpdate(config: IToolConfig, params: Record<string, unknown>) {
  const resources = new Resources({ token: PROFILE_TOKEN, region: TEST_REGION });
  const context = makeTestContext({ resources, token: PROFILE_TOKEN, credentialKind: "profile" });
  const parsed = z.object(config.parameters).parse(params);
  return config.tool(context, parsed as never);
}

const updateAnalysisPolicy = (params: Record<string, unknown>) => callUpdate(updateAnalysisAccessPolicyConfigJSON, params);
const updateRunUserPolicy = (params: Record<string, unknown>) => callUpdate(updateRunUserAccessPolicyConfigJSON, params);

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

/**
 * Stores a target of an arity the platform's parser cannot classify, so it
 * resolves to no policy and contributes no kind. Neither tool's name matches
 * such a policy, which is the case both are allowed to repair.
 */
function seedUnresolvableTargets(id: string) {
  editPolicy(id, { targets: [["analysis", "id"]] });
}

beforeAll(() => mockServer.listen(strictListenOptions));
beforeEach(() => resetAccessPolicies());
afterEach(() => {
  mockServer.resetHandlers();
  mockServer.events.removeAllListeners();
});
afterAll(() => mockServer.close());

describe("the update tools replace rule lists rather than merging", () => {
  it("replaces every rule with the ones supplied", async () => {
    expect(policyById(ANALYSIS_POLICY)?.permissions).toHaveLength(2);

    await updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, permissions: [{ effect: "allow", resource: "device", actions: ["get_data"] }] });

    // The two original rules are gone: this is replacement, not a merge, and it
    // is the tool's central hazard.
    expect(policyById(ANALYSIS_POLICY)?.permissions).toEqual([{ effect: "allow", action: ["get_data"], resource: ["device"] }]);
  });

  it("shows the policy before and after so the replacement is visible", async () => {
    const result = await updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, permissions: [{ effect: "allow", resource: "device", actions: ["get_data"] }] });

    expect(result).toContain("**Before**");
    expect(result).toContain("**After**");
    // The dropped rules appear in Before and not in After.
    const [, after] = result.split("**After**");
    expect(result).toContain("Device / Send data");
    expect(after).not.toContain("Device / Send data");
    expect(result).toContain("replaced its previous contents whole");
  });

  it("renders the After view allow-first, the order the API will return", async () => {
    const result = await updateAnalysisPolicy({
      access_policy_id: ANALYSIS_POLICY,
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
    await updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, active: false });

    expect(policyById(ANALYSIS_POLICY)?.permissions).toHaveLength(2);
    expect(policyById(ANALYSIS_POLICY)?.active).toBe(false);
  });

  // The note explains the platform, not the policy, and a diff renders two
  // policies. Printed under each half it was five sentences of duplication in
  // the output an agent reads most often.
  it("prints the evaluation note once for a diff, not once per half", async () => {
    const result = await updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, permissions: [{ effect: "allow", resource: "device", actions: ["get_data"] }] });

    const marker = "How these are evaluated:";
    expect(result.split(marker)).toHaveLength(2);
    // Still present, and after both halves rather than inside one.
    expect(result.indexOf(marker)).toBeGreaterThan(result.indexOf("**After**"));
  });

  it("reports what it changed", async () => {
    const result = await updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, name: "Renamed", active: false });

    expect(result).toContain("name, active");
    expect(policyById(ANALYSIS_POLICY)?.name).toBe("Renamed");
  });
});

describe("the update tools read the policy before touching it", () => {
  it("reads it even for a rename, which cannot drop a rule", async () => {
    // The tool's NAME asserts which kind of policy it edits, and the stored
    // targets are the only place that claim can be checked, so the read is not
    // conditional on what is being changed.
    const requests = trackRequests();

    await updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, name: "Renamed" });

    expect(requests).toEqual([`GET /am/${ANALYSIS_POLICY}`, `PUT /am/${ANALYSIS_POLICY}`]);
  });
});

describe("each update tool edits only the kind of policy it is named for", () => {
  it("refuses an analysis edit of a run-user policy and names the tool that owns it", async () => {
    const requests = trackRequests();

    await expect(updateAnalysisPolicy({ access_policy_id: RUN_POLICY, name: "Renamed" })).rejects.toThrow(/update_run_user_access_policy/);

    expect(requests).toEqual([`GET /am/${RUN_POLICY}`]);
    expect(policyById(RUN_POLICY)?.name).toBe(fixtures.accessPolicies[1].name);
  });

  it("refuses a run-user edit of an analysis policy and names the tool that owns it", async () => {
    const requests = trackRequests();

    await expect(updateRunUserPolicy({ access_policy_id: ANALYSIS_POLICY, name: "Renamed" })).rejects.toThrow(/update_analysis_access_policy/);

    expect(requests).toEqual([`GET /am/${ANALYSIS_POLICY}`]);
    expect(policyById(ANALYSIS_POLICY)?.name).toBe(fixtures.accessPolicies[0].name);
  });

  it("refuses to replace the rules or targets of a policy targeting both kinds, from either tool", async () => {
    const requests = trackRequests();

    // Replacing either list on a mixed policy silently resolves it to one kind
    // and drops what the other kind had, so neither tool will do it.
    await expect(updateAnalysisPolicy({ access_policy_id: MIXED_POLICY, targets: [{ by: "any" }] })).rejects.toThrow(/targets both an analysis and a TagoRUN user/);
    await expect(updateRunUserPolicy({ access_policy_id: MIXED_POLICY, permissions: [{ effect: "allow", resource: "dashboard", actions: ["access"] }] })).rejects.toThrow(
      /targets both an analysis and a TagoRUN user/
    );

    expect(requests).toEqual([`GET /am/${MIXED_POLICY}`, `GET /am/${MIXED_POLICY}`]);
    expect(policyById(MIXED_POLICY)?.targets).toEqual(MIXED.targets);
    expect(policyById(MIXED_POLICY)?.permissions).toEqual(MIXED.permissions);
  });

  // Deactivating is the reversible way to switch a bad policy off, and it drops
  // nothing. Refusing it would leave deletion as the only remedy for the one
  // policy shape most likely to need switching off in a hurry.
  it.each(["analysis", "run_user"] as const)("lets the %s tool deactivate and rename a mixed policy, which loses nothing", async (kind) => {
    const update = kind === "analysis" ? updateAnalysisPolicy : updateRunUserPolicy;

    await update({ access_policy_id: MIXED_POLICY, active: false, name: `Off via ${kind}` });

    expect(policyById(MIXED_POLICY)?.active).toBe(false);
    expect(policyById(MIXED_POLICY)?.name).toBe(`Off via ${kind}`);
    expect(policyById(MIXED_POLICY)?.targets).toEqual(MIXED.targets);
  });

  it("lets the analysis tool repair a policy whose targets resolve to nothing", async () => {
    seedUnresolvableTargets(ANALYSIS_POLICY);

    await updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, targets: [{ by: "any" }] });

    expect(policyById(ANALYSIS_POLICY)?.targets).toEqual([["analysis"]]);
  });

  // Regression: the pre-split tool refused this through assertResolvableTargets,
  // which was dropped when validatePermissions narrowed to a single kind.
  it("refuses to assign rules to a policy no token can match, and says to send targets too", async () => {
    seedUnresolvableTargets(ANALYSIS_POLICY);
    const requests = trackRequests();
    const before = policyById(ANALYSIS_POLICY)?.permissions;

    await expect(updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, permissions: [{ effect: "allow", resource: "device", actions: ["send_data"] }] })).rejects.toThrow(
      /no target the platform can resolve/
    );

    expect(requests.some((entry) => entry.startsWith("PUT"))).toBe(false);
    expect(policyById(ANALYSIS_POLICY)?.permissions).toEqual(before);
  });

  it("accepts those same rules when targets are sent in the same call", async () => {
    seedUnresolvableTargets(ANALYSIS_POLICY);

    await updateAnalysisPolicy({
      access_policy_id: ANALYSIS_POLICY,
      targets: [{ by: "any" }],
      permissions: [{ effect: "allow", resource: "device", actions: ["send_data"] }],
    });

    expect(policyById(ANALYSIS_POLICY)?.targets).toEqual([["analysis"]]);
  });

  it("lets the run-user tool repair a policy whose targets resolve to nothing", async () => {
    // No kind owns a policy the platform can match to no token, so the stored
    // head word does not reserve it for one tool.
    seedUnresolvableTargets(ANALYSIS_POLICY);

    await updateRunUserPolicy({ access_policy_id: ANALYSIS_POLICY, targets: [{ by: "any" }] });

    expect(policyById(ANALYSIS_POLICY)?.targets).toEqual([["run_user"]]);
  });
});

describe("the update tools validate submitted rules against their own kind", () => {
  it("refuses a resource the tool's kind cannot be granted on, without writing", async () => {
    await expect(updateRunUserPolicy({ access_policy_id: RUN_POLICY, permissions: [{ effect: "allow", resource: "file", actions: ["upload"] }] })).rejects.toThrow(
      /cannot grant on resource `file`/
    );

    expect(policyById(RUN_POLICY)?.permissions).toEqual(fixtures.accessPolicies[1].permissions);
  });

  it("refuses an action the resource does not offer this kind, without writing", async () => {
    await expect(updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, permissions: [{ effect: "allow", resource: "device", actions: ["login_as_user"] }] })).rejects.toThrow(
      /has no action `login_as_user`/
    );

    expect(policyById(ANALYSIS_POLICY)?.permissions).toHaveLength(2);
  });

  it("accepts for one kind the rule it refuses for the other", async () => {
    // `dashboard`/`arrangement` exists only in the run-user catalog.
    const rule = { effect: "allow", resource: "dashboard", actions: ["arrangement"] };

    await expect(updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, permissions: [rule] })).rejects.toThrow(/has no action `arrangement`/);

    await updateRunUserPolicy({ access_policy_id: RUN_POLICY, permissions: [rule] });
    expect(policyById(RUN_POLICY)?.permissions).toEqual([{ effect: "allow", action: ["arrangement"], resource: ["dashboard"] }]);
  });
});

describe("the update tools fail closed when the permission catalog cannot be read", () => {
  beforeEach(() => {
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: false, message: "unavailable" }, { status: 503 })));
  });

  it("writes nothing when rules are being replaced, since they cannot be checked", async () => {
    await expect(updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, permissions: [{ effect: "allow", resource: "device", actions: ["get_data"] }] })).rejects.toThrow(
      /Permission catalog lookup failed/
    );

    expect(policyById(ANALYSIS_POLICY)?.permissions).toEqual(fixtures.accessPolicies[0].permissions);
  });

  it("says the rules were not checked when it renders a diff it could not label", async () => {
    const result = await updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, targets: [{ by: "any" }] });

    expect(result).toContain("**Before**");
    expect(result).toContain("could not be read");
  });

  it("still allows a targets-only change, which submits no rule to check", async () => {
    await updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, targets: [{ by: "any" }] });

    expect(policyById(ANALYSIS_POLICY)?.targets).toEqual([["analysis"]]);
  });

  it("still allows a rename", async () => {
    await updateAnalysisPolicy({ access_policy_id: ANALYSIS_POLICY, name: "Renamed" });

    expect(policyById(ANALYSIS_POLICY)?.name).toBe("Renamed");
  });
});
