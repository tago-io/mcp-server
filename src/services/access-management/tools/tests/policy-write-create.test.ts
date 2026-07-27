import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { TEST_REGION, makeTestContext } from "../../../../testing/context";
import { FREE_PLAN_POLICY_LIMIT, resetAccessPolicies, setPolicyLimit, storedPolicies } from "../../../../testing/mocks/am-policies";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { IToolConfig } from "../../../types";
import { createAnalysisAccessPolicyConfigJSON, createRunUserAccessPolicyConfigJSON } from "../policy-write";

const PROFILE_TOKEN = "p-0000000000000000000000000000000000";
const API = "https://api.us-e1.tago.io";
const ANALYSIS_ID = fixtures.IDS.analysis;
const DEVICE_ID = fixtures.IDS.device;

async function callCreate(config: IToolConfig, params: Record<string, unknown>) {
  const resources = new Resources({ token: PROFILE_TOKEN, region: TEST_REGION });
  const context = makeTestContext({ resources, token: PROFILE_TOKEN, credentialKind: "profile" });
  const parsed = z.object(config.parameters).parse(params);
  return config.tool(context, parsed as never);
}

const createAnalysisPolicy = (params: Record<string, unknown>) => callCreate(createAnalysisAccessPolicyConfigJSON, params);
const createRunUserPolicy = (params: Record<string, unknown>) => callCreate(createRunUserAccessPolicyConfigJSON, params);

const ID_TARGET = { by: "id", id: ANALYSIS_ID };
const ANY_TARGET = { by: "any" };
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

describe("the create tools write the tuple shapes the API can evaluate", () => {
  it("builds a tag-scoped rule and an id target as wire tuples", async () => {
    const result = await createAnalysisPolicy({
      name: "Parser access",
      targets: [ID_TARGET],
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

  it("takes the target kind from the tool, not from the input", async () => {
    // The same bare match spec heads a different tuple in each tool; nothing in
    // the parameters names the kind.
    await createRunUserPolicy({
      name: "Plant floor",
      targets: [{ by: "tag", key: "site", value: "plant-a" }],
      permissions: [{ effect: "allow", resource: "dashboard", actions: ["access"] }],
    });

    expect(storedPolicies().at(-1)?.targets).toEqual([["run_user", "tag.key", "site", "tag.value", "plant-a"]]);
  });

  it("defaults an omitted rule match to `any`, which is arity 1 on the wire", async () => {
    await createAnalysisPolicy({ name: "Any device", targets: [ANY_TARGET], permissions: [SEND_DATA_RULE] });

    const created = storedPolicies().at(-1);
    expect(created?.targets).toEqual([["analysis"]]);
    expect(created?.permissions[0].resource).toEqual(["device"]);
  });
});

describe("the create tools refuse policies the API would store and never honour", () => {
  it("rejects a resource this kind cannot be granted on, before any write", async () => {
    const writes = trackWrites();

    await expect(createRunUserPolicy({ name: "Bad", targets: [ANY_TARGET], permissions: [{ effect: "allow", resource: "file", actions: ["upload"] }] })).rejects.toThrow(
      /cannot grant on resource `file`/
    );

    expect(writes).toEqual([]);
    expect(storedPolicies()).toHaveLength(fixtures.accessPolicies.length);
  });

  it("offers an example naming a resource this kind can be granted on", async () => {
    // `device` is grantable to a run user, but only for `access`, so the example
    // has to come from the catalog rather than from a fixed literal. `device` is
    // the preferred exemplar, so this does not depend on catalog sort order.
    const failure = await createRunUserPolicy({
      name: "Bad",
      targets: [ANY_TARGET],
      permissions: [{ effect: "allow", resource: "file", actions: ["upload"] }],
    }).catch((error: Error) => error.message);

    const example = failure.slice(failure.indexOf("Valid example:"));
    expect(example).toContain('{ "effect": "allow", "resource": "device", "actions": ["access"] }');
    expect(example).not.toContain("upload");
  });

  it("rejects an action the resource does not offer, and names the ones it does", async () => {
    const writes = trackWrites();

    await expect(createAnalysisPolicy({ name: "Bad", targets: [ID_TARGET], permissions: [{ effect: "allow", resource: "device", actions: ["login_as_user"] }] })).rejects.toThrow(
      /has no action `login_as_user`.*send_data/s
    );

    expect(writes).toEqual([]);
  });

  it("rejects a match form the grant does not accept, and names the accepted ones", async () => {
    const writes = trackWrites();

    // `device`/`create` drops `id`: there is no device yet to name.
    await expect(
      createAnalysisPolicy({ name: "Bad", targets: [ID_TARGET], permissions: [{ effect: "allow", resource: "device", actions: ["create"], match: { by: "id", id: DEVICE_ID } }] })
    ).rejects.toThrow(/cannot be matched by `id`.*any, tag, tag_match/s);

    expect(writes).toEqual([]);
  });

  it("cannot express a malformed tuple at all: the schema rejects an unknown match form", async () => {
    await expect(createAnalysisPolicy({ name: "Bad", targets: [ID_TARGET], permissions: [{ ...SEND_DATA_RULE, match: { by: "name", name: "sensor" } }] })).rejects.toThrow();
  });

  it("rejects a path target, which the target matcher has no branch for", async () => {
    await expect(createAnalysisPolicy({ name: "Bad", targets: [{ by: "path", path: "x/" }], permissions: [SEND_DATA_RULE] })).rejects.toThrow();
  });
});

describe("each create tool validates against its own kind's catalog", () => {
  it("refuses device/send_data for a run user while the analysis tool accepts it", async () => {
    const rule = { effect: "allow", resource: "device", actions: ["send_data"] };
    const writes = trackWrites();

    // A run user's `device` grant is `access` and nothing else, so this rule
    // would be stored and never fire.
    const failure = await createRunUserPolicy({ name: "Bad", targets: [ANY_TARGET], permissions: [rule] }).catch((error: Error) => error.message);
    expect(failure).toMatch(/resource `device` has no action `send_data` for a `run_user` policy/);
    // The example must not hand back the pairing just refused.
    const example = failure.slice(failure.indexOf("Valid example:"));
    expect(example).toContain('{ "effect": "allow", "resource": "device", "actions": ["access"] }');
    expect(example).not.toContain("send_data");
    expect(writes).toEqual([]);

    await createAnalysisPolicy({ name: "Fine", targets: [ANY_TARGET], permissions: [rule] });
    expect(storedPolicies().at(-1)?.permissions).toEqual([{ effect: "allow", action: ["send_data"], resource: ["device"] }]);
  });

  it("refuses dashboard/arrangement for an analysis while the run-user tool accepts it", async () => {
    const rule = { effect: "allow", resource: "dashboard", actions: ["arrangement"] };
    const writes = trackWrites();

    // `dashboard` exists in both catalogs with different actions: only a run
    // user can be granted `arrangement`.
    const failure = await createAnalysisPolicy({ name: "Bad", targets: [ANY_TARGET], permissions: [rule] }).catch((error: Error) => error.message);
    expect(failure).toMatch(/resource `dashboard` has no action `arrangement` for a `analysis` policy/);
    expect(failure).toContain("Available: access, create, delete, duplicate, edit");
    const example = failure.slice(failure.indexOf("Valid example:"));
    expect(example).toContain('{ "effect": "allow", "resource": "dashboard", "actions": ["access"] }');
    expect(example).not.toContain("arrangement");
    expect(writes).toEqual([]);

    await createRunUserPolicy({ name: "Fine", targets: [ANY_TARGET], permissions: [rule] });
    expect(storedPolicies().at(-1)?.permissions).toEqual([{ effect: "allow", action: ["arrangement"], resource: ["dashboard"] }]);
  });
});

describe("the create tools tolerate a catalog they cannot fully judge", () => {
  it("accepts a grant the platform ships without match forms, rather than refusing unsatisfiably", async () => {
    // Catalog drift is the reason this matrix is fetched rather than vendored.
    // A grant with no match_by cannot be judged, and refusing it would produce
    // an error naming no acceptable form at all.
    const drifted = structuredClone(fixtures.amSettings) as typeof fixtures.amSettings;
    (drifted.settings.analysis.device as unknown as Array<Record<string, unknown>>).push({ label: "Beam", value: "beam", description: "New grant", match_by: [] });
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: true, result: drifted })));

    await createAnalysisPolicy({
      name: "Drifted",
      targets: [ID_TARGET],
      permissions: [{ effect: "allow", resource: "device", actions: ["beam"], match: { by: "id", id: DEVICE_ID } }],
    });

    expect(storedPolicies().at(-1)?.permissions).toEqual([{ effect: "allow", action: ["beam"], resource: ["device", "id", DEVICE_ID] }]);
  });
});

describe("the create tools fail closed when the permission catalog cannot be read", () => {
  it("writes nothing, because an unverifiable policy is the outcome this domain prevents", async () => {
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: false, message: "unavailable" }, { status: 503 })));
    const writes = trackWrites();

    await expect(createAnalysisPolicy({ name: "Degraded", targets: [ID_TARGET], permissions: [SEND_DATA_RULE] })).rejects.toThrow(/Permission catalog lookup failed/);

    expect(writes).toEqual([]);
    expect(storedPolicies()).toHaveLength(fixtures.accessPolicies.length);
  });

  it("does not leak the request credential in the failure", async () => {
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: false, message: `rejected for ${PROFILE_TOKEN}` }, { status: 401 })));

    const failure = await createAnalysisPolicy({ name: "Degraded", targets: [ID_TARGET], permissions: [SEND_DATA_RULE] }).catch((error: Error) => error.message);

    expect(failure).not.toContain(PROFILE_TOKEN);
  });
});

describe("the create tools confirm what the API will actually evaluate", () => {
  it("renders rules allow-first, the order the API returns and evaluates, not the order submitted", async () => {
    const result = await createAnalysisPolicy({
      name: "Ordered",
      targets: [ID_TARGET],
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

  it("says so when the policy was created inactive, naming the update tool that can switch it on", async () => {
    const result = await createRunUserPolicy({ name: "Off", active: false, targets: [ANY_TARGET], permissions: [{ effect: "allow", resource: "dashboard", actions: ["access"] }] });

    expect(result).toContain("INACTIVE");
    expect(result).toContain("update_run_user_access_policy");
  });
});

describe("the create tools surface the plan limit", () => {
  it("reports the resource limit rather than a bare failure", async () => {
    // The free plan allows 5 policies; the seeded profile already holds more.
    setPolicyLimit(FREE_PLAN_POLICY_LIMIT);

    await expect(createAnalysisPolicy({ name: "One too many", targets: [ID_TARGET], permissions: [SEND_DATA_RULE] })).rejects.toThrow(/maximum limit of Access management \(5\)/);
  });
});
