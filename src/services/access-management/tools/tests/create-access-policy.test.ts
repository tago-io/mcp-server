import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { TEST_REGION, makeTestContext } from "../../../../testing/context";
import { resetAccessPolicies, storedPolicies } from "../../../../testing/mocks/am-policies";
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

describe("create_access_policy when the permission catalog cannot be read", () => {
  it("still writes, still builds valid tuples, and says the pairing was unchecked", async () => {
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: false, message: "unavailable" }, { status: 503 })));

    const result = await createPolicy({ name: "Degraded", targets: [ANALYSIS_TARGET], permissions: [SEND_DATA_RULE] });

    expect(storedPolicies().at(-1)?.permissions[0].resource).toEqual(["device"]);
    expect(result).toContain("NOT verified");
  });

  it("does not silently accept a rule the catalog would have refused, without saying so", async () => {
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: false, message: "unavailable" }, { status: 503 })));

    const result = await createPolicy({ name: "Degraded", targets: [ANALYSIS_TARGET], permissions: [{ effect: "allow", resource: "device", actions: ["login_as_user"] }] });

    expect(result).toContain("NOT verified");
    expect(result).toContain("get_access_policy");
  });
});

describe("create_access_policy surfaces the plan limit", () => {
  it("reports the resource limit rather than a bare failure", async () => {
    for (let index = storedPolicies().length; index < 5; index += 1) {
      await createPolicy({ name: `Filler ${index}`, targets: [ANALYSIS_TARGET], permissions: [SEND_DATA_RULE] });
    }

    await expect(createPolicy({ name: "One too many", targets: [ANALYSIS_TARGET], permissions: [SEND_DATA_RULE] })).rejects.toThrow(/maximum limit of Access management \(5\)/);
  });
});
