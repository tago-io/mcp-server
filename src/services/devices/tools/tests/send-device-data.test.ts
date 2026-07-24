import { Resources } from "@tago-io/sdk";
import { http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { API, ok } from "../../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { sendDeviceDataConfigJSON } from "../send-device-data";

const DEVICE_ID = fixtures.IDS.device;
const PROFILE_TOKEN = "p-0000000000000000000000000000000000";
const ANALYSIS_TOKEN = "a-0000000000000000000000000000000000";
const DATA = [{ variable: "temperature", value: 25.5 }];

/** Records EVERY outbound SDK request (method + path) so we can assert routing. */
function trackAllRequests() {
  const requests: string[] = [];
  mockServer.events.on("request:start", ({ request }) => {
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  return requests;
}

function sendWith(token: string, credentialKind: "profile" | "analysis") {
  const resources = new Resources({ token, region: TEST_REGION });
  const context = makeTestContext({ resources, token, credentialKind });
  return sendDeviceDataConfigJSON.tool(context, { device_id: DEVICE_ID, data: DATA } as never);
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => {
  mockServer.resetHandlers();
  mockServer.events.removeAllListeners();
});
afterAll(() => mockServer.close());

describe("send_device_data profile path against the real SDK routes (MSW)", () => {
  it("reuses a usable device token and ingests through POST /data, never POST /device/:id/data", async () => {
    const requests = trackAllRequests();

    const result = await sendWith(PROFILE_TOKEN, "profile");

    expect(result).toContain("1 Data Added");
    // Resolved the reusable token, ingested through the device-token route.
    expect(requests).toContain(`GET /device/token/${DEVICE_ID}`);
    expect(requests).toContain("POST /data");
    // Never the analysis-only route that AUTHDENIES a profile token.
    expect(requests).not.toContain(`POST /device/${DEVICE_ID}/data`);
    // A usable token already existed, so nothing was minted.
    expect(requests).not.toContain("POST /device/token");
  });

  it("mints a device token when none is usable, then ingests through POST /data", async () => {
    mockServer.use(http.get(`${API}/device/token/:deviceID`, () => ok([])));
    const requests = trackAllRequests();

    const result = await sendWith(PROFILE_TOKEN, "profile");

    expect(result).toContain("1 Data Added");
    expect(requests).toContain(`GET /device/token/${DEVICE_ID}`);
    // No usable token, so one was created before ingesting.
    expect(requests).toContain("POST /device/token");
    expect(requests).toContain("POST /data");
    expect(requests).not.toContain(`POST /device/${DEVICE_ID}/data`);
  });

  it("skips an expired token and mints a fresh one", async () => {
    const expired = { ...fixtures.deviceToken, permission: "full", expire_time: "2000-01-01T00:00:00.000Z" };
    mockServer.use(http.get(`${API}/device/token/:deviceID`, () => ok([expired])));
    const requests = trackAllRequests();

    const result = await sendWith(PROFILE_TOKEN, "profile");

    expect(result).toContain("1 Data Added");
    expect(requests).toContain("POST /device/token");
    expect(requests).toContain("POST /data");
  });

  it("skips a read-only token and mints a writable one", async () => {
    const readOnly = { ...fixtures.deviceToken, permission: "read", expire_time: "never" };
    mockServer.use(http.get(`${API}/device/token/:deviceID`, () => ok([readOnly])));
    const requests = trackAllRequests();

    const result = await sendWith(PROFILE_TOKEN, "profile");

    expect(result).toContain("1 Data Added");
    expect(requests).toContain("POST /device/token");
    expect(requests).toContain("POST /data");
  });

  it("leaves the analysis send path unchanged: POST /device/:id/data, never tokenList/tokenCreate", async () => {
    const requests = trackAllRequests();

    const result = await sendWith(ANALYSIS_TOKEN, "analysis");

    expect(result).toContain("1 Data Added");
    expect(requests).toContain(`POST /device/${DEVICE_ID}/data`);
    expect(requests).not.toContain("POST /data");
    expect(requests).not.toContain(`GET /device/token/${DEVICE_ID}`);
    expect(requests).not.toContain("POST /device/token");
  });
});
