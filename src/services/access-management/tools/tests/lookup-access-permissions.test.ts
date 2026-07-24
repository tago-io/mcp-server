import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { TEST_REGION, makeTestContext } from "../../../../testing/context";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { lookupAccessPermissionsConfigJSON } from "../lookup-access-permissions";

const PROFILE_TOKEN = "p-0000000000000000000000000000000000";
const API = "https://api.us-e1.tago.io";

async function lookup(params: Record<string, unknown>) {
  const resources = new Resources({ token: PROFILE_TOKEN, region: TEST_REGION });
  const context = makeTestContext({ resources, token: PROFILE_TOKEN, credentialKind: "profile" });
  const parsed = z.object(lookupAccessPermissionsConfigJSON.parameters).parse(params);
  return lookupAccessPermissionsConfigJSON.tool(context, parsed as never);
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("lookup_access_permissions serves the platform's own catalog", () => {
  it("lists a resource's actions for analysis targets", async () => {
    const result = await lookup({ target_type: "analysis", resource: "device" });

    expect(result).toContain("`send_data`");
    expect(result).toContain("`get_data`");
    expect(result).toContain("(Device)");
  });

  it("reports each grant's meaning and accepted match forms in detailed mode", async () => {
    const result = await lookup({ target_type: "analysis", resource: "device", response_format: "detailed" });

    expect(result).toContain("Allows analyses to send data to a device");
    expect(result).toContain("Device / Send data");
    // `create` accepts no `id`, which is the asymmetry a caller has to see.
    expect(result).toMatch(/`create`.*Match by: tag, tag_match, any/);
    expect(result).toMatch(/`send_data`.*Match by: id, tag, tag_match, any/);
  });

  it("shows run_user targets a much smaller surface than analysis targets", async () => {
    const runUser = await lookup({ target_type: "run_user" });
    const analysis = await lookup({ target_type: "analysis" });

    expect(runUser).toContain("`dashboard`");
    expect(runUser).not.toContain("`file`");
    expect(analysis).toContain("`file`");
  });

  it("rejects a resource the target kind cannot be granted on, and names what it can", async () => {
    await expect(lookup({ target_type: "run_user", resource: "file" })).rejects.toThrow(/cannot be granted anything on `file`.*dashboard, device/s);
  });

  it("explains the match forms, since a wrong one is stored and never matches", async () => {
    const result = await lookup({ target_type: "analysis", resource: "device" });

    expect(result).toContain("`tag_match`");
    expect(result).toContain("never matches");
  });
});

describe("lookup_access_permissions when the catalog is unreachable", () => {
  it("fails with a credential-safe message rather than inventing a catalog", async () => {
    mockServer.use(http.get(`${API}/am/settings`, () => HttpResponse.json({ status: false, message: "service unavailable" }, { status: 503 })));

    const failure = await lookup({ target_type: "analysis" }).catch((error: Error) => error.message);

    expect(failure).toContain("Permission catalog lookup failed");
    expect(failure).not.toContain(PROFILE_TOKEN);
  });
});
