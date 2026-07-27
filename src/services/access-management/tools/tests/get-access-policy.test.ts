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
const INERT_TARGETS_POLICY = "61f00000000000000ab000ff";
const DENY_ONLY_POLICY = fixtures.accessPolicies.find((policy) => policy.name === "[Analysis] - Deny only, any target")!.id;
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

    expect(result).toContain("the last matching rule wins");
    expect(result).toContain("a matching deny beats a matching allow");
    // The platform has more than one evaluator and they resolve a cross-policy
    // deny differently, so the page must not assert either behaviour globally.
    // Listing is `allow AND NOT deny`, where a deny always applies; a single
    // operation check is last-match-wins over policies pooled in unspecified
    // order, where it may not.
    expect(result).toContain("a deny always applies no matter which policy holds it");
    expect(result).toContain("the order policies are pooled in is unspecified");
    expect(result).toContain("Keeping a deny in the same policy as the allow it limits is reliable in both cases");
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

    expect(result).toContain("this target is stored malformed");
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
    expect(result).toContain("reaches both");
  });

  it("tells the caller what either update tool will still do to a mixed policy", async () => {
    const result = await getPolicy({ access_policy_id: MIXED_POLICY });

    // Refusing every edit would leave deletion as the only remedy, so the
    // reversible one has to be named where the problem is reported.
    expect(result).toContain("active: false");
    expect(result).not.toContain("Edit this policy with update_analysis_access_policy");
  });
});

describe("get_access_policy names what a policy does not do", () => {
  // Found live: a policy whose only rule is a deny reads as a working block,
  // and adds nothing. The rule itself is valid, so nothing marks it INERT.
  it("says a deny-only policy grants nothing by itself", async () => {
    const result = await getPolicy({ access_policy_id: DENY_ONLY_POLICY });

    expect(result).toContain("no ALLOW rule");
    expect(result).toContain("grants nothing by itself");
    // The claim is scoped to what holds regardless of how the platform orders
    // rules across policies, which is unspecified on the analysis path.
    expect(result).toContain("can only narrow what another policy allows");
  });

  it("does not say it of a policy that has an allow", async () => {
    const result = await getPolicy({ access_policy_id: PARSER_POLICY });
    expect(result).not.toContain("no ALLOW rule");
  });

  it("flags an `any` target that makes its narrower siblings pointless", async () => {
    const result = await getPolicy({ access_policy_id: DENY_ONLY_POLICY });

    expect(result).toContain("this policy covers any analysis");
    expect(result).toContain("the scope is wider than the list suggests");
  });

  it("says multiple targets are alternatives, which nothing said before", async () => {
    const result = await getPolicy({ access_policy_id: DENY_ONLY_POLICY });
    expect(result).toContain("matching ANY line above");
  });

  it("says nothing about alternatives when there is only one target", async () => {
    const result = await getPolicy({ access_policy_id: PARSER_POLICY });
    expect(result).not.toContain("matching ANY line above");
  });
});

describe("get_access_policy does not claim coverage from targets that select nothing", () => {
  // Regression: the alternatives note was gated on how many target LINES
  // rendered, and an INERT entry renders a line while selecting nothing, so a
  // policy whose every target was dead announced that it covered them.
  it("stays silent when every target is inert", async () => {
    mockServer.use(
      http.get(`${API}/am/:amID`, () =>
        HttpResponse.json({
          status: true,
          result: {
            id: INERT_TARGETS_POLICY,
            name: "All targets inert",
            active: true,
            tags: [],
            targets: [
              ["analysis", "id"],
              ["run_user", "path", "reports/"],
            ],
            permissions: [],
          },
        })
      )
    );

    const result = await getPolicy({ access_policy_id: INERT_TARGETS_POLICY });

    expect(result).toContain("selects nothing");
    expect(result).not.toContain("matching ANY line above");
  });

  // An inert entry beside a working one must not make the working one claim the
  // whole policy is dead, nor the dead one claim coverage.
  it("describes an inert entry as itself, not as the whole policy", async () => {
    mockServer.use(
      http.get(`${API}/am/:amID`, () =>
        HttpResponse.json({
          status: true,
          result: {
            id: INERT_TARGETS_POLICY,
            name: "One live, one inert",
            active: true,
            tags: [],
            targets: [
              ["analysis", "id", fixtures.IDS.analysis],
              ["analysis", "id"],
            ],
            permissions: [],
          },
        })
      )
    );

    const result = await getPolicy({ access_policy_id: INERT_TARGETS_POLICY });

    expect(result).toContain("this target is stored malformed, so it selects nothing");
    expect(result).not.toContain("this policy applies to nothing");
    // Only one target resolves, so there is nothing to call an alternative.
    expect(result).not.toContain("matching ANY line above");
  });
});

describe("get_access_policy reads as English on every target shape", () => {
  function policyWith(targets: string[][]) {
    mockServer.use(
      http.get(`${API}/am/:amID`, () => HttpResponse.json({ status: true, result: { id: INERT_TARGETS_POLICY, name: "shape", active: true, tags: [], targets, permissions: [] } }))
    );
    return getPolicy({ access_policy_id: INERT_TARGETS_POLICY });
  }

  // The article is per kind and only the first word is capitalised. A previous
  // version capitalised each element and produced "An analysis or A run user".
  it("names both kinds without capitalising mid-sentence", async () => {
    expect(await policyWith([["analysis", "id", fixtures.IDS.analysis], ["run_user"]])).toContain("An analysis or a run user matching ANY line above");
  });

  it("names one kind when only one is present", async () => {
    expect(
      await policyWith([
        ["run_user", "id", fixtures.IDS.user],
        ["run_user", "tag.key", "k", "tag.value", "v"],
      ])
    ).toContain("A run user matching ANY line above");
  });

  // The count is of narrower entries OF THE SUBSUMED KINDS. Deriving it from the
  // total resolved count counted another kind's targets and said "entries" of one.
  it("counts one narrower entry as one, and agrees the verb", async () => {
    const result = await policyWith([["analysis"], ["analysis", "id", fixtures.IDS.analysis], ["run_user", "id", fixtures.IDS.user]]);

    expect(result).toContain("the narrower entry of that kind above adds nothing");
  });

  it("uses the plural and plural verb for two narrower entries", async () => {
    const result = await policyWith([["analysis"], ["analysis", "id", fixtures.IDS.analysis], ["analysis", "tag.key", "k", "tag.value", "v"]]);

    expect(result).toContain("the narrower entries of that kind above add nothing");
  });
});
