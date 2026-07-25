import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { TEST_REGION, makeTestContext } from "../../../../testing/context";
import { FREE_PLAN_POLICY_LIMIT, resetAccessPolicies, setPolicyLimit, storedPolicies } from "../../../../testing/mocks/am-policies";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { createAccessPolicyConfigJSON } from "../create-access-policy";

const PROFILE_TOKEN = "p-0000000000000000000000000000000000";
const API = "https://api.us-e1.tago.io";
const ANALYSIS_ID = fixtures.IDS.analysis;
const DEVICE_ID = fixtures.IDS.device;

async function createPolicy(params: Record<string, unknown>) {
  const resources = new Resources({ token: PROFILE_TOKEN, region: TEST_REGION });
  const context = makeTestContext({ resources, token: PROFILE_TOKEN, credentialKind: "profile" });
  const parsed = z.object(createAccessPolicyConfigJSON.parameters).parse(params);
  return createAccessPolicyConfigJSON.tool(context, parsed as never);
}

const ANALYSIS_TARGET = { type: "analysis", match: { by: "id", id: ANALYSIS_ID } };
const SEND_DATA_RULE = { effect: "allow", resource: "device", actions: ["send_data"] };

function trackWrites() {
  const writes: string[] = [];
  mockServer.events.on("request:start", ({ request }) => {
    if (request.method !== "GET") {
      writes.push(`${request.method} ${new URL(request.url).pathname}`);
    }
  });
  return writes;
}

beforeAll(() => mockServer.listen(strictListenOptions));
beforeEach(() => resetAccessPolicies());
afterEach(() => {
  mockServer.resetHandlers();
  mockServer.events.removeAllListeners();
});
afterAll(() => mockServer.close());

describe("create_access_policy writes the tuple shapes the API can evaluate", () => {
  it("builds a tag-scoped rule and an id target as wire tuples", async () => {
    const result = await createPolicy({
      name: "Parser access",
      targets: [ANALYSIS_TARGET],
      permissions: [{ effect: "allow", resource: "device", actions: ["send_data", "get_data"], match: { by: "tag", key: "device_type", value: "sensor" } }],
    });

    const created = storedPolicies().at(-1);
    expect(created?.targets).toEqual([["analysis", "id", ANALYSIS_ID]]);
    expect(created?.permissions).toEqual([{ effect: "allow", action: ["send_data", "get_data"], resource: ["device", "tag.key", "device_type", "tag.value", "sensor"] }]);
    expect(result).toContain("created");
    // The confirmation decodes what was written rather than echoing the input.
    expect(result).toContain("Device / Send data");
    expect(result).toContain("tagged `device_type` = `sensor`");
  });

  it("defaults an omitted match to `any`, which is arity 1 on the wire", async () => {
    await createPolicy({ name: "Any device", targets: [{ type: "analysis" }], permissions: [SEND_DATA_RULE] });

    const created = storedPolicies().at(-1);
    expect(created?.targets).toEqual([["analysis"]]);
    expect(created?.permissions[0].resource).toEqual(["device"]);
  });
});

describe("create_access_policy refuses policies the API would store and never honour", () => {
  it("rejects a resource the target kind cannot be granted on, before any write", async () => {
    const writes = trackWrites();

    await expect(createPolicy({ name: "Bad", targets: [{ type: "run_user" }], permissions: [{ effect: "allow", resource: "file", actions: ["upload"] }] })).rejects.toThrow(
      /cannot grant on resource `file`/
    );

    expect(writes).toEqual([]);
    expect(storedPolicies()).toHaveLength(fixtures.accessPolicies.length);
  });

  it("offers an example naming a resource these targets can be granted on", async () => {
    // `device` is grantable to a run user, but only for `access`, so the example
    // has to come from the catalog rather than from a fixed literal. `device` is
    // the preferred exemplar, so this does not depend on catalog sort order.
    const failure = await createPolicy({
      name: "Bad",
      targets: [{ type: "run_user" }],
      permissions: [{ effect: "allow", resource: "file", actions: ["upload"] }],
    }).catch((error: Error) => error.message);

    const example = failure.slice(failure.indexOf("Valid example:"));
    expect(example).toContain('{ "effect": "allow", "resource": "device", "actions": ["access"] }');
    expect(example).not.toContain("send_data");
  });

  it("rejects an action the resource does not offer, and names the ones it does", async () => {
    const writes = trackWrites();

    await expect(createPolicy({ name: "Bad", targets: [ANALYSIS_TARGET], permissions: [{ effect: "allow", resource: "device", actions: ["login_as_user"] }] })).rejects.toThrow(
      /has no action `login_as_user`.*send_data/s
    );

    expect(writes).toEqual([]);
  });

  it("rejects a match form the grant does not accept, and names the accepted ones", async () => {
    const writes = trackWrites();

    // `device`/`create` drops `id`: there is no device yet to name.
    await expect(
      createPolicy({ name: "Bad", targets: [ANALYSIS_TARGET], permissions: [{ effect: "allow", resource: "device", actions: ["create"], match: { by: "id", id: DEVICE_ID } }] })
    ).rejects.toThrow(/cannot be matched by `id`.*any, tag, tag_match/s);

    expect(writes).toEqual([]);
  });

  it("accepts a rule valid for only one of several target kinds", async () => {
    // `file` is grantable to analyses and not to run users; the policy targets
    // both, so the rule can still fire and must not be refused.
    await createPolicy({
      name: "Mixed",
      targets: [{ type: "analysis" }, { type: "run_user" }],
      permissions: [{ effect: "allow", resource: "file", actions: ["upload"], match: { by: "path", path: "reports/" } }],
    });

    expect(storedPolicies().at(-1)?.permissions[0].resource).toEqual(["file", "path", "reports/"]);
  });

  it("cannot express a malformed tuple at all: the schema rejects an unknown match form", async () => {
    await expect(createPolicy({ name: "Bad", targets: [ANALYSIS_TARGET], permissions: [{ ...SEND_DATA_RULE, match: { by: "name", name: "sensor" } }] })).rejects.toThrow();
  });

  it("rejects a path target, which the target matcher has no branch for", async () => {
    await expect(createPolicy({ name: "Bad", targets: [{ type: "analysis", match: { by: "path", path: "x/" } }], permissions: [SEND_DATA_RULE] })).rejects.toThrow();
  });
});

describe("create_access_policy tolerates a catalog it cannot fully judge", () => {
  it("accepts a grant the platform ships without match forms, rather than refusing unsatisfiably", async () => {
    // Catalog drift is the reason this matrix is fetched rather than vendored.
    // A grant with no match_by cannot be judged, and refusing it would produce
    // an error naming no acceptable form at all.
    const drifted = structuredClone(fixtures.amSettings) as typeof fixtures.amSettings;
    (drifted.settings.analysis.device as unknown as Array<Record<string, unknown>>).push({ label: "Beam", value: "beam", description: "New grant", match_by: [] });
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: true, result: drifted })));

    await createPolicy({ name: "Drifted", targets: [ANALYSIS_TARGET], permissions: [{ effect: "allow", resource: "device", actions: ["beam"] }] });

    expect(storedPolicies().at(-1)?.permissions).toEqual([{ effect: "allow", action: ["beam"], resource: ["device"] }]);
  });
});

describe("create_access_policy does not call a grant dead on incomplete catalog data", () => {
  it("accepts when one target kind's grant is unjudgeable and another's rejects the form", async () => {
    // analysis offers device/access with no match forms; run_user offers it by
    // id only. Judging only the run_user grant would report the action dead,
    // when the analysis grant leaves the answer unknown.
    const drifted = structuredClone(fixtures.amSettings) as typeof fixtures.amSettings;
    const analysisDevice = drifted.settings.analysis.device as unknown as Array<Record<string, unknown>>;
    analysisDevice.find((grant) => grant.value === "access")!.match_by = [];
    (drifted.settings.run_user.device as unknown as Array<Record<string, unknown>>).find((grant) => grant.value === "access")!.match_by = ["id"];
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: true, result: drifted })));

    await createPolicy({
      name: "Unknown not dead",
      targets: [{ type: "analysis" }, { type: "run_user" }],
      permissions: [{ effect: "allow", resource: "device", actions: ["access"] }],
    });

    expect(storedPolicies().at(-1)?.permissions).toEqual([{ effect: "allow", action: ["access"], resource: ["device"] }]);
  });
});

describe("create_access_policy fails closed when the permission catalog cannot be read", () => {
  it("writes nothing, because an unverifiable policy is the outcome this domain prevents", async () => {
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: false, message: "unavailable" }, { status: 503 })));
    const writes = trackWrites();

    await expect(createPolicy({ name: "Degraded", targets: [ANALYSIS_TARGET], permissions: [SEND_DATA_RULE] })).rejects.toThrow(/Permission catalog lookup failed/);

    expect(writes).toEqual([]);
    expect(storedPolicies()).toHaveLength(fixtures.accessPolicies.length);
  });

  it("does not leak the request credential in the failure", async () => {
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: false, message: `rejected for ${PROFILE_TOKEN}` }, { status: 401 })));

    const failure = await createPolicy({ name: "Degraded", targets: [ANALYSIS_TARGET], permissions: [SEND_DATA_RULE] }).catch((error: Error) => error.message);

    expect(failure).not.toContain(PROFILE_TOKEN);
  });
});

describe("create_access_policy confirms what the API will actually evaluate", () => {
  it("renders rules allow-first, the order the API returns and evaluates, not the order submitted", async () => {
    const result = await createPolicy({
      name: "Ordered",
      targets: [ANALYSIS_TARGET],
      permissions: [
        { effect: "deny", resource: "device", actions: ["delete"] },
        { effect: "allow", resource: "device", actions: ["delete"], match: { by: "id", id: DEVICE_ID } },
      ],
    });

    const allowIndex = result.indexOf("1. ALLOW");
    const denyIndex = result.indexOf("2. DENY");
    expect(allowIndex).toBeGreaterThan(-1);
    // Submitted deny-first. The API re-sorts to allow-then-deny, so the blanket
    // deny is what fires last; rendering as submitted would imply the opposite.
    expect(denyIndex).toBeGreaterThan(allowIndex);
  });

  it("says so when the policy was created inactive", async () => {
    const result = await createPolicy({ name: "Off", active: false, targets: [ANALYSIS_TARGET], permissions: [SEND_DATA_RULE] });

    expect(result).toContain("INACTIVE");
  });

  it("labels a grant from whichever target kind actually offers it", async () => {
    // run_user is listed first but has no `file` grant; the label must still be
    // the console name from analysis, not the raw wire action.
    const result = await createPolicy({
      name: "Mixed labels",
      targets: [{ type: "run_user" }, { type: "analysis" }],
      permissions: [{ effect: "allow", resource: "file", actions: ["upload"], match: { by: "path", path: "reports/" } }],
    });

    expect(result).toContain("File / Upload");
  });
});

describe("create_access_policy surfaces the plan limit", () => {
  it("reports the resource limit rather than a bare failure", async () => {
    // The free plan allows 5 policies; the seeded profile already holds more.
    setPolicyLimit(FREE_PLAN_POLICY_LIMIT);

    await expect(createPolicy({ name: "One too many", targets: [ANALYSIS_TARGET], permissions: [SEND_DATA_RULE] })).rejects.toThrow(/maximum limit of Access management \(5\)/);
  });
});
