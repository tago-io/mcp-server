import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

import { makeTestContext } from "../../../../testing/context";
import { invokeTool } from "../../../../testing/invoke-tool";
import { deviceTools } from "../index";
import { deleteDeviceConfigJSON } from "../delete-device";
import { deleteDeviceDataConfigJSON } from "../delete-device-data";
import { editDeviceDataConfigJSON } from "../edit-device-data";
import { getDeviceConfigJSON } from "../get-device";
import { readDeviceDataConfigJSON } from "../read-device-data";
import { searchDevicesConfigJSON } from "../search-devices";
import { sendDeviceDataConfigJSON } from "../send-device-data";

const DEVICE_ID = "61f0000000000000000d0001";
const ANALYSIS_TOKEN = "a-0000000000000000000000000000000000";
const PROFILE_TOKEN = "p-0000000000000000000000000000000000";
const DEVICE_TOKEN = "00000000-0000-4000-8000-000000000001";

describe("device tool schemas", () => {
  it("every description example validates against its own schema", () => {
    for (const config of deviceTools) {
      const matches = Array.from(config.description.matchAll(/<example>([\s\S]*?)<\/example>/g));
      expect(matches.length, `${config.name} has no example`).toBeGreaterThan(0);
      for (const match of matches) {
        const parsed = JSON.parse(match[1].trim());
        const result = z.object(config.parameters).safeParse(parsed);
        expect(result.success, `${config.name} example fails its schema`).toBe(true);
      }
    }
  });

  it("get/update/delete tools require a 24-character device_id", () => {
    for (const config of [getDeviceConfigJSON, deleteDeviceConfigJSON, readDeviceDataConfigJSON]) {
      const schema = z.object(config.parameters);
      expect(schema.safeParse({ device_id: "short" }).success, config.name).toBe(false);
    }
  });
});

describe("search_devices", () => {
  it("wraps the name filter exactly once at query build time", async () => {
    const resources = { devices: { list: vi.fn().mockResolvedValue([]) } };
    // Replays the SDK validation pass before the handler, as at runtime.
    const validated = z.object(searchDevicesConfigJSON.parameters).parse({ filter: { name: "sensor" } });
    await searchDevicesConfigJSON.tool(makeTestContext({ resources }), validated as never);

    const query = resources.devices.list.mock.calls[0][0];
    expect(query.filter.name).toBe("*sensor*");
  });

  it("applies the default amount and passes pagination", async () => {
    const resources = { devices: { list: vi.fn().mockResolvedValue([]) } };
    await searchDevicesConfigJSON.tool(makeTestContext({ resources }), { page: 3 } as never);

    const query = resources.devices.list.mock.calls[0][0];
    expect(query.amount).toBe(20);
    expect(query.page).toBe(3);
  });

  it("passes orderBy as a top-level tuple, never inside the filter", async () => {
    const resources = { devices: { list: vi.fn().mockResolvedValue([]) } };
    await searchDevicesConfigJSON.tool(makeTestContext({ resources }), { filter: { name: "sensor", orderBy: "name,asc" } } as never);

    const query = resources.devices.list.mock.calls[0][0];
    expect(query.orderBy).toEqual(["name", "asc"]);
    expect(query.filter).toEqual({ name: "*sensor*" });
  });

  it("rejects an invalid orderBy before calling the SDK", async () => {
    const resources = { devices: { list: vi.fn() } };
    await expect(searchDevicesConfigJSON.tool(makeTestContext({ resources }), { filter: { orderBy: "name,upwards" } } as never)).rejects.toThrow(/orderBy/);
    expect(resources.devices.list).not.toHaveBeenCalled();
  });

  it("passes an exact id filter through to the SDK", async () => {
    const resources = { devices: { list: vi.fn().mockResolvedValue([]) } };
    await searchDevicesConfigJSON.tool(makeTestContext({ resources }), { filter: { id: DEVICE_ID } } as never);

    const query = resources.devices.list.mock.calls[0][0];
    expect(query.filter).toEqual({ id: DEVICE_ID });
  });

  it("rejects an id filter that is not 24 characters", () => {
    const schema = z.object(searchDevicesConfigJSON.parameters);
    expect(schema.safeParse({ filter: { id: "short" } }).success).toBe(false);
    expect(schema.safeParse({ filter: { id: DEVICE_ID } }).success).toBe(true);
  });

  it("adds a truncation steer when the page is full", async () => {
    const items = Array.from({ length: 2 }, (_, index) => ({ id: `${index}`, name: `Device ${index}` }));
    const resources = { devices: { list: vi.fn().mockResolvedValue(items) } };
    const result = await searchDevicesConfigJSON.tool(makeTestContext({ resources }), { amount: 2 } as never);

    expect(result).toContain("more may exist");
  });

  it("renders exactly the requested fields in concise mode, matching the SDK query", async () => {
    const device = { id: DEVICE_ID, name: "Dock Sensor", type: "mutable", connector: "61f0000000000000000c0001", tags: [{ key: "site", value: "dock-7" }] };
    const resources = { devices: { list: vi.fn().mockResolvedValue([device]) } };
    const params = z.object(searchDevicesConfigJSON.parameters).parse({ fields: ["id", "name", "tags"], response_format: "concise" });
    const result = await searchDevicesConfigJSON.tool(makeTestContext({ resources }), params as never);

    expect(resources.devices.list.mock.calls[0][0].fields).toEqual(["id", "name", "tags"]);
    expect(result).toContain("dock-7");
    expect(result).toContain("Dock Sensor");
    expect(result).not.toContain("61f0000000000000000c0001");
  });
});

describe("get_device", () => {
  it("fetches data amount and params only when requested", async () => {
    const resources = {
      devices: {
        info: vi.fn().mockResolvedValue({ id: DEVICE_ID, name: "Sensor" }),
        amount: vi.fn().mockResolvedValue(42),
        paramList: vi.fn().mockResolvedValue([]),
      },
    };

    await getDeviceConfigJSON.tool(makeTestContext({ resources }), { device_id: DEVICE_ID } as never);
    expect(resources.devices.amount).not.toHaveBeenCalled();
    expect(resources.devices.paramList).not.toHaveBeenCalled();

    const result = await getDeviceConfigJSON.tool(makeTestContext({ resources }), { device_id: DEVICE_ID, include_data_amount: true } as never);
    expect(resources.devices.amount).toHaveBeenCalledWith(DEVICE_ID);
    expect(result).toContain("42");
  });
});

/** Full mock of the Resources device-data surface plus tokenList, to prove routing. */
function makeDataResources() {
  return {
    devices: {
      getDeviceData: vi.fn().mockResolvedValue([]),
      sendDeviceData: vi.fn().mockResolvedValue("1 Data Added"),
      editDeviceData: vi.fn().mockResolvedValue("1 Data Updated"),
      deleteDeviceData: vi.fn().mockResolvedValue("1 Data Removed"),
      tokenList: vi.fn(),
    },
  };
}

const DATA_PARAMS = [{ variable: "temperature", value: 25.5 }];
const EDIT_PARAMS = [{ id: "61f0000000000000000dd001", value: 26 }];

async function runAllDataOperations(context: ReturnType<typeof makeTestContext>) {
  await readDeviceDataConfigJSON.tool(context, { device_id: DEVICE_ID } as never);
  await sendDeviceDataConfigJSON.tool(context, { device_id: DEVICE_ID, data: DATA_PARAMS } as never);
  await editDeviceDataConfigJSON.tool(context, { device_id: DEVICE_ID, data: EDIT_PARAMS } as never);
  await deleteDeviceDataConfigJSON.tool(context, { device_id: DEVICE_ID, variables: ["humidity"] } as never);
}

describe("device data credential routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const [kind, token] of [
    ["profile", PROFILE_TOKEN],
    ["analysis", ANALYSIS_TOKEN],
  ] as const) {
    it(`routes all four operations through Resources for ${kind} tokens, never tokenList`, async () => {
      const resources = makeDataResources();
      await runAllDataOperations(makeTestContext({ resources, token }));

      expect(resources.devices.getDeviceData).toHaveBeenCalledWith(DEVICE_ID, expect.anything());
      expect(resources.devices.sendDeviceData).toHaveBeenCalledWith(DEVICE_ID, DATA_PARAMS);
      expect(resources.devices.editDeviceData).toHaveBeenCalledWith(DEVICE_ID, EDIT_PARAMS);
      expect(resources.devices.deleteDeviceData).toHaveBeenCalledWith(DEVICE_ID, expect.objectContaining({ variables: ["humidity"] }));
      expect(resources.devices.tokenList).not.toHaveBeenCalled();
    });
  }

  it("routes device tokens through a Device client built with the supplied token and request region", async () => {
    const resources = makeDataResources();
    const region = { api: "https://api.eu-w1.tago.io", sse: "https://sse.eu-w1.tago.io" };

    // Serve the Device client's outbound calls from a fetch stub; the SDK
    // attaches the constructor token as a `token` header on global fetch.
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ status: true, result: [] }), { status: 200, headers: { "content-type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);

    await runAllDataOperations(makeTestContext({ resources, token: DEVICE_TOKEN, region }));

    expect(resources.devices.tokenList).not.toHaveBeenCalled();
    expect(resources.devices.getDeviceData).not.toHaveBeenCalled();
    expect(resources.devices.sendDeviceData).not.toHaveBeenCalled();
    expect(resources.devices.editDeviceData).not.toHaveBeenCalled();
    expect(resources.devices.deleteDeviceData).not.toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [url, init] of fetchMock.mock.calls as unknown as [string, { headers: Record<string, string> }][]) {
      expect(String(url)).toContain(region.api);
      expect(init.headers.token).toBe(DEVICE_TOKEN);
    }
  });
});

describe("device token identity binding", () => {
  const OTHER_DEVICE_ID = "61f0000000000000000d0099";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Any outbound request on a mismatch is a failure, including the DELETE. */
  function makeGuardedSetup(authenticatedDeviceId: string) {
    const resources = makeDataResources();
    const fetchMock = vi.fn(() => Promise.reject(new Error("must not reach the API")));
    vi.stubGlobal("fetch", fetchMock);
    const context = makeTestContext({ resources, token: DEVICE_TOKEN, authenticatedDeviceId });
    return { resources, fetchMock, context };
  }

  const MISMATCH = /bound to device/;

  it("rejects reads for a device other than the authenticated one before any data request", async () => {
    const { fetchMock, context } = makeGuardedSetup(OTHER_DEVICE_ID);
    await expect(readDeviceDataConfigJSON.tool(context, { device_id: DEVICE_ID } as never)).rejects.toThrow(MISMATCH);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects sends for a device other than the authenticated one before any data request", async () => {
    const { fetchMock, context } = makeGuardedSetup(OTHER_DEVICE_ID);
    await expect(sendDeviceDataConfigJSON.tool(context, { device_id: DEVICE_ID, data: DATA_PARAMS } as never)).rejects.toThrow(MISMATCH);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects edits for a device other than the authenticated one before any data request", async () => {
    const { fetchMock, context } = makeGuardedSetup(OTHER_DEVICE_ID);
    await expect(editDeviceDataConfigJSON.tool(context, { device_id: DEVICE_ID, data: EDIT_PARAMS } as never)).rejects.toThrow(MISMATCH);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects deletes for a device other than the authenticated one; no DELETE request is ever made", async () => {
    const { fetchMock, context } = makeGuardedSetup(OTHER_DEVICE_ID);
    await expect(deleteDeviceDataConfigJSON.tool(context, { device_id: DEVICE_ID, variables: ["humidity"] } as never)).rejects.toThrow(MISMATCH);
    expect(fetchMock).not.toHaveBeenCalled();
    const requestInits = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(requestInits.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });

  it("names both the authenticated and the requested device in the mismatch error", async () => {
    const { context } = makeGuardedSetup(OTHER_DEVICE_ID);
    const error = await readDeviceDataConfigJSON.tool(context, { device_id: DEVICE_ID } as never).catch((caught) => caught as Error);
    expect((error as Error).message).toContain(OTHER_DEVICE_ID);
    expect((error as Error).message).toContain(DEVICE_ID);
  });

  it("allows all four operations when the supplied device_id matches the authenticated device", async () => {
    const resources = makeDataResources();
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ status: true, result: [] }), { status: 200, headers: { "content-type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);

    await runAllDataOperations(makeTestContext({ resources, token: DEVICE_TOKEN, authenticatedDeviceId: DEVICE_ID }));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("read_device_data query validation", () => {
  function makeReadContext() {
    const resources = { devices: { getDeviceData: vi.fn().mockResolvedValue([]) } };
    return { resources, context: makeTestContext({ resources, token: ANALYSIS_TOKEN }) };
  }

  async function expectRejected(params: Record<string, unknown>, pattern: RegExp) {
    const { resources, context } = makeReadContext();
    await expect(invokeTool(readDeviceDataConfigJSON, context, { device_id: DEVICE_ID, ...params })).rejects.toThrow(pattern);
    expect(resources.devices.getDeviceData).not.toHaveBeenCalled();
  }

  async function expectAccepted(params: Record<string, unknown>) {
    const { resources, context } = makeReadContext();
    await readDeviceDataConfigJSON.tool(context, { device_id: DEVICE_ID, ...params } as never);
    expect(resources.devices.getDeviceData).toHaveBeenCalledTimes(1);
  }

  const START_DATE = "2026-06-01T00:00:00Z";

  it("accepts avg and sum with start_date", async () => {
    await expectAccepted({ query: "avg", start_date: START_DATE });
    await expectAccepted({ query: "sum", start_date: START_DATE });
  });

  it("rejects avg and sum without start_date before calling the SDK", async () => {
    await expectRejected({ query: "avg" }, /start_date/);
    await expectRejected({ query: "sum" }, /start_date/);
  });

  it("accepts min, max, and count without extra fields", async () => {
    await expectAccepted({ query: "min" });
    await expectAccepted({ query: "max" });
    await expectAccepted({ query: "count" });
  });

  it.each(["avg", "sum", "min", "max"])("accepts aggregate function %s under query='aggregate'", async (fn) => {
    await expectAccepted({ query: "aggregate", interval: "day", function: fn });
  });

  it.each(["gt", "gte", "lt", "lte", "eq", "ne"])("rejects conditional function %s under query='aggregate'", async (fn) => {
    await expectRejected({ query: "aggregate", interval: "day", function: fn }, /aggregate queries accept only/);
  });

  it("rejects aggregate queries missing interval or function", async () => {
    await expectRejected({ query: "aggregate", function: "avg" }, /interval and function/);
    await expectRejected({ query: "aggregate", interval: "day" }, /interval and function/);
  });

  it.each(["gt", "gte", "lt", "lte", "eq", "ne"])("accepts conditional function %s under query='conditional'", async (fn) => {
    await expectAccepted({ query: "conditional", start_date: START_DATE, value: 25.5, function: fn });
  });

  it.each(["avg", "sum", "min", "max"])("rejects aggregate function %s under query='conditional'", async (fn) => {
    await expectRejected({ query: "conditional", start_date: START_DATE, value: 25.5, function: fn }, /conditional queries accept only/);
  });

  it("rejects conditional queries missing start_date, value, or function", async () => {
    await expectRejected({ query: "conditional", value: 25.5, function: "gt" }, /start_date, value, and function/);
    await expectRejected({ query: "conditional", start_date: START_DATE, function: "gt" }, /start_date, value, and function/);
    await expectRejected({ query: "conditional", start_date: START_DATE, value: 25.5 }, /start_date, value, and function/);
  });

  it("rejects aggregation-only fields on default and first/last queries", async () => {
    await expectRejected({ interval: "day" }, /does not apply to query='default'/);
    await expectRejected({ query: "default", function: "avg" }, /does not apply to query='default'/);
    await expectRejected({ query: "last_value", value: 10 }, /does not apply to query='last_value'/);
    await expectRejected({ query: "first_item", interval: "hour" }, /does not apply to query='first_item'/);
  });

  it("rejects stray aggregation fields on summary queries", async () => {
    await expectRejected({ query: "min", interval: "day" }, /does not apply to query='min'/);
    await expectRejected({ query: "max", function: "avg" }, /does not apply to query='max'/);
    await expectRejected({ query: "count", value: 1 }, /does not apply to query='count'/);
    await expectRejected({ query: "avg", start_date: START_DATE, value: 5 }, /does not apply to query='avg'/);
    await expectRejected({ query: "sum", start_date: START_DATE, interval: "day" }, /does not apply to query='sum'/);
  });

  it("rejects fields belonging to the other aggregation family", async () => {
    await expectRejected({ query: "aggregate", interval: "day", function: "avg", value: 5 }, /does not apply to query='aggregate'/);
    await expectRejected({ query: "conditional", start_date: START_DATE, value: 25.5, function: "gt", interval: "day" }, /does not apply to query='conditional'/);
  });
});

describe("send_device_data and delete_device_data", () => {
  it("sends data through the analysis-token path", async () => {
    const resources = { devices: { sendDeviceData: vi.fn().mockResolvedValue("1 Data Added") } };
    const result = await sendDeviceDataConfigJSON.tool(makeTestContext({ resources, token: ANALYSIS_TOKEN }), {
      device_id: DEVICE_ID,
      data: [{ variable: "temperature", value: 25.5 }],
    } as never);

    expect(resources.devices.sendDeviceData).toHaveBeenCalledWith(DEVICE_ID, [{ variable: "temperature", value: 25.5 }]);
    expect(result).toContain("1 Data Added");
  });

  it("deletes data with the provided filters", async () => {
    const resources = { devices: { deleteDeviceData: vi.fn().mockResolvedValue("2 Data Removed") } };
    await deleteDeviceDataConfigJSON.tool(makeTestContext({ resources, token: ANALYSIS_TOKEN }), {
      device_id: DEVICE_ID,
      variables: ["humidity"],
      qty: 100,
    } as never);

    expect(resources.devices.deleteDeviceData).toHaveBeenCalledWith(DEVICE_ID, expect.objectContaining({ variables: ["humidity"], qty: 100 }));
  });
});
