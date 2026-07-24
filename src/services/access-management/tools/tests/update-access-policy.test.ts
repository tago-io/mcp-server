import { Resources } from "@tago-io/sdk";
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

describe("update_access_policy reports what it changed", () => {
  it("names the changed fields", async () => {
    const result = await updatePolicy({ access_policy_id: PARSER_POLICY, name: "Renamed", active: false });

    expect(result).toContain("name, active");
    expect(policyById(PARSER_POLICY)?.name).toBe("Renamed");
  });
});
