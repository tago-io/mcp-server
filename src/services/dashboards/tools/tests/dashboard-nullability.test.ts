import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../../../../server/build-server";
import { TEST_REGION } from "../../../../testing/context";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";

/**
 * Nullable public fields and collection clearing exercised through a real MCP
 * client/server pair; the zod input schemas only run at this boundary, so
 * unit-level handler calls cannot prove that `tab: null` / `hidden: null`
 * are accepted. Stored dashboards legitimately carry both (the dashboard
 * schema and the SDK type both allow null), so get → update round-trips must
 * work without stripping or rejecting them.
 */

const API = "https://api.us-e1.tago.io";
const TOKEN = "a-0000000000000000000000000000000000";
const DASHBOARD_ID = fixtures.IDS.dashboard;

// Stored state with nullable layout fields, as the API can return it.
const storedArrangement = [
  { widget_id: fixtures.IDS.widget, x: 0, y: 0, width: 4, height: 2, tab: null },
  { widget_id: fixtures.IDS.widgetOther, x: 4, y: 0, width: 4, height: 2, tab: "overview" },
];
const storedTabs = [
  { key: "overview", value: "Overview", hidden: null },
  { key: "alerts", value: "Alerts", hidden: false },
];

async function connect() {
  const resources = new Resources({ token: TOKEN, region: TEST_REGION });
  const server = buildServer({ resources, token: TOKEN, region: TEST_REGION, credentialKind: "analysis" });
  const client = new Client({ name: "nullability-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

async function callTool(name: string, args: Record<string, unknown>) {
  const { client, server } = await connect();
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ text: string }>).map((entry) => entry.text).join("\n");
    return { isError: result.isError === true, text };
  } finally {
    await client.close();
    await server.close();
  }
}

function useNullableDashboard() {
  const putBodies: Array<Record<string, unknown>> = [];
  mockServer.use(
    http.get(`${API}/dashboard/:id`, () => HttpResponse.json({ status: true, result: { ...fixtures.dashboardInfo, tabs: storedTabs, arrangement: storedArrangement } })),
    http.put(`${API}/dashboard/:id`, async ({ request }) => {
      putBodies.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ status: true, result: "Successfully Updated" });
    })
  );
  return putBodies;
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("nullable layout state through the MCP boundary", () => {
  it("accepts arrangement[].tab: null and sends it exactly", async () => {
    const putBodies = useNullableDashboard();
    const arrangement = [{ widget_id: fixtures.IDS.widget, x: 0, y: 0, width: 4, height: 2, tab: null }];

    const { isError } = await callTool("update_dashboard", { dashboard_id: DASHBOARD_ID, arrangement });

    expect(isError).toBe(false);
    expect(putBodies).toEqual([{ arrangement }]);
  });

  it("accepts tabs[].hidden: null and sends it exactly", async () => {
    const putBodies = useNullableDashboard();
    const tabs = [{ key: "overview", value: "Overview", hidden: null }];

    const { isError } = await callTool("update_dashboard", { dashboard_id: DASHBOARD_ID, tabs });

    expect(isError).toBe(false);
    expect(putBodies).toEqual([{ tabs }]);
  });

  it("round-trips a stored dashboard: nulls, unrelated arrangement entries, and tabs survive edit", async () => {
    const putBodies = useNullableDashboard();

    const read = await callTool("get_dashboard", { dashboard_id: DASHBOARD_ID, response_format: "detailed" });
    expect(read.isError).toBe(false);

    // Re-send the stored arrangement plus one new placement, keeping the
    // null tab and the unrelated entries untouched.
    const arrangement = [...storedArrangement, { widget_id: fixtures.IDS.widgetUnplaced, x: 0, y: 2, width: 8, height: 2, tab: "alerts" }];
    const update = await callTool("update_dashboard", { dashboard_id: DASHBOARD_ID, arrangement });

    expect(update.isError, update.text).toBe(false);
    expect(putBodies).toEqual([{ arrangement }]);
  });

  it("round-trips stored tabs carrying hidden: null unchanged", async () => {
    const putBodies = useNullableDashboard();

    const update = await callTool("update_dashboard", { dashboard_id: DASHBOARD_ID, tabs: storedTabs });

    expect(update.isError, update.text).toBe(false);
    expect(putBodies).toEqual([{ tabs: storedTabs }]);
  });

  it("clears dashboard collections with []: the exact empty arrays reach the wire", async () => {
    const putBodies = useNullableDashboard();

    const update = await callTool("update_dashboard", { dashboard_id: DASHBOARD_ID, tabs: [], arrangement: [] });

    expect(update.isError, update.text).toBe(false);
    expect(putBodies).toEqual([{ tabs: [], arrangement: [] }]);
  });
});
