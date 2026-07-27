import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { TEST_REGION, makeTestContext } from "../../../../testing/context";
import { resetAccessPolicies } from "../../../../testing/mocks/am-policies";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { getAccessPolicyConfigJSON } from "../get-access-policy";

const PROFILE_TOKEN = "p-0000000000000000000000000000000000";
const API = "https://api.us-e1.tago.io";
const PARSER_POLICY = fixtures.accessPolicies[0].id;
const RUN_POLICY = fixtures.accessPolicies[1].id;
const MIXED_POLICY = fixtures.accessPolicies.find((policy) => policy.name === "[Mixed] - Analysis and run user")!.id;
const INERT_POLICY = fixtures.accessPolicies[2].id;

async function getPolicy(params: Record<string, unknown>) {
  const resources = new Resources({ token: PROFILE_TOKEN, region: TEST_REGION });
  const context = makeTestContext({ resources, token: PROFILE_TOKEN, credentialKind: "profile" });
  const parsed = z.object(getAccessPolicyConfigJSON.parameters).parse(params);
  return getAccessPolicyConfigJSON.tool(context, parsed as never);
}

beforeAll(() => mockServer.listen(strictListenOptions));
beforeEach(() => resetAccessPolicies());
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("get_access_policy renders rules in the order that decides them", () => {
  it("renders the API's order, not the order the rules were written in", async () => {
    // The fixture stores deny first; the info route returns allow first
    // (ORDER BY effect ASC). Since the last matching rule wins, echoing the
    // stored order would name the wrong deciding rule.
    const result = await getPolicy({ access_policy_id: PARSER_POLICY });

    const allowIndex = result.indexOf("1. ALLOW");
    const denyIndex = result.indexOf("2. DENY");
    expect(allowIndex).toBeGreaterThan(-1);
    expect(denyIndex).toBeGreaterThan(allowIndex);
  });

  it("states how the rules are evaluated, including the cross-policy caveat", async () => {
    const result = await getPolicy({ access_policy_id: PARSER_POLICY });

    expect(result).toContain("the last one in this list wins");
    expect(result).toContain("a matching deny beats a matching allow");
    expect(result).toContain("Across policies it defines no order");
  });

  it("decodes each rule into the grant name and what it covers", async () => {
    const result = await getPolicy({ access_policy_id: PARSER_POLICY });

    expect(result).toContain("Device / Send data");
    expect(result).toContain("Device / Get data");
    expect(result).toContain("tagged `device_type` = `sensor`");
    expect(result).toContain(`device id \`${fixtures.IDS.deviceImmutable}\``);
  });

  it("names the analyses or run users the policy applies to", async () => {
    expect(await getPolicy({ access_policy_id: PARSER_POLICY })).toContain(`analysis id \`${fixtures.IDS.analysis}\``);
    expect(await getPolicy({ access_policy_id: RUN_POLICY })).toContain("any run user");
  });
});

describe("get_access_policy flags rules that can never fire", () => {
  it("marks a malformed tuple, an unknown action, and a rejected match form", async () => {
    const result = await getPolicy({ access_policy_id: INERT_POLICY });

    // Arity 2: stored happily by the API, classified as nothing.
    expect(result).toMatch(/INERT: the stored resource is malformed/);
    expect(result).toMatch(/INERT:.*has no action `login_as_user`/);
    expect(result).toMatch(/INERT:.*`create` cannot be matched by `id`/);
  });

  it("marks a half-live rule PARTLY INERT, not dead", async () => {
    const result = await getPolicy({ access_policy_id: INERT_POLICY });

    // The rule grants `access` and cannot grant `login_as_user`; calling the
    // whole rule INERT would hide a permission the policy really does grant.
    expect(result).toMatch(/PARTLY INERT:.*has no action `login_as_user`/);
  });

  it("marks a rule with no actions at all", async () => {
    const result = await getPolicy({ access_policy_id: INERT_POLICY });

    expect(result).toMatch(/INERT: the rule lists no actions/);
  });

  it("does not let a malformed target vouch for a rule", async () => {
    // The analysis target is malformed, so it selects no policy. Counting its
    // kind would let it declare an analysis-only rule meaningful.
    mockServer.use(
      http.get(`${API}/am/:amID`, () =>
        HttpResponse.json({
          status: true,
          result: {
            id: PARSER_POLICY,
            name: "Malformed target",
            active: true,
            tags: [],
            targets: [["analysis", "id"]],
            permissions: [{ effect: "allow", action: ["upload"], resource: ["file", "path", "reports/"] }],
          },
        })
      )
    );

    const result = await getPolicy({ access_policy_id: PARSER_POLICY });

    expect(result).toContain("the stored target is malformed");
    // No per-rule catalog verdict, because the targets section already carries
    // the real cause and repeating it per rule would bury it.
    expect(result).not.toContain("PARTLY INERT");
  });

  it("does not mark a rule that can fire", async () => {
    const result = await getPolicy({ access_policy_id: PARSER_POLICY });
    expect(result).not.toContain("INERT");
  });

  it("says an inactive policy grants nothing regardless of its rules", async () => {
    const result = await getPolicy({ access_policy_id: RUN_POLICY });
    expect(result).toContain("INACTIVE");
  });
});

describe("get_access_policy without the permission catalog", () => {
  it("still renders the policy, without labels and without inert checking", async () => {
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: false, message: "unavailable" }, { status: 503 })));

    const result = await getPolicy({ access_policy_id: INERT_POLICY });

    expect(result).toContain("device / login_as_user");
    expect(result).toContain("were not checked");
    // The malformed tuple is grammar, not catalog, so it is still caught.
    expect(result).toContain("the stored resource is malformed");
  });
});

describe("get_access_policy names the tool that owns the policy", () => {
  it.each([
    ["analysis", PARSER_POLICY, "update_analysis_access_policy"],
    ["run_user", RUN_POLICY, "update_run_user_access_policy"],
  ])("points a %s policy at its own update tool", async (_kind, id, tool) => {
    const result = await getPolicy({ access_policy_id: id });
    expect(result).toContain(tool);
  });

  // The search route returns no targets, so this is the only place a caller can
  // learn which update tool will accept the policy.
  it("flags a policy targeting both kinds and names the cross-grant", async () => {
    const result = await getPolicy({ access_policy_id: MIXED_POLICY });

    expect(result).toContain("targets BOTH an analysis and a TagoRUN user");
    expect(result).toContain("grants to both");
  });

  it("tells the caller what either update tool will still do to a mixed policy", async () => {
    const result = await getPolicy({ access_policy_id: MIXED_POLICY });

    // Refusing every edit would leave deletion as the only remedy, so the
    // reversible one has to be named where the problem is reported.
    expect(result).toContain("active: false");
    expect(result).not.toContain("Edit this policy with update_analysis_access_policy");
  });
});
