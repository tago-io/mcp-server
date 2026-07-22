import { Resources } from "@tago-io/sdk";
import { http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { invokeTool } from "../../../../testing/invoke-tool";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { API, ok } from "../../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { getWidgetSchema, WIDGET_TYPES } from "../../validation-adapter";
import { createWidgetConfigJSON } from "../create-widget";
import { deleteWidgetConfigJSON } from "../delete-widget";
import { updateDashboardConfigJSON } from "../update-dashboard";
import { updateWidgetConfigJSON } from "../update-widget";
import { MAX_SCHEMA_RESPONSE_BYTES, serializeWidgetSchema, widgetSchemaLookupConfigJSON } from "../widget-schema-lookup";

const DASHBOARD_ID = fixtures.IDS.dashboard;
const WIDGET_ID = fixtures.IDS.widget;
const REQUEST_TOKEN = "a-0000000000000000000000000000000000";

// Already canonical per the package schema: validation must not inject or
// coerce anything, so the wire body deep-equals this object.
const CANONICAL_GAUGE = { label: "Tank Level", type: "gauge", display: { gauge_type: "solid", numberformat: "0", minimum: 0, maximum: 100 } };

function makeContext() {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  return makeTestContext({ resources, token: REQUEST_TOKEN });
}

function captureBodies(method: "post" | "put", path: string, response: unknown) {
  const bodies: Array<Record<string, unknown>> = [];
  mockServer.use(
    http[method](path, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return ok(response);
    })
  );
  return bodies;
}

function extractFencedJson(output: string): string {
  const match = output.match(/```json\n([\s\S]*?)\n```/);
  expect(match, "output carries a fenced JSON block").not.toBeNull();
  return (match as RegExpMatchArray)[1];
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("create_widget", () => {
  it("sends exactly the canonical gauge configuration with no injected defaults", async () => {
    const bodies = captureBodies("post", `${API}/dashboard/:dashboardID/widget/`, fixtures.widgetCreateResponse);

    const result = await createWidgetConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, configuration: CANONICAL_GAUGE });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual(CANONICAL_GAUGE);
    expect(result).toContain(WIDGET_ID);
    expect(result).toContain("NOT yet placed");
    expect(result).toContain("update_dashboard");
  });

  it("rejects an invalid configuration with dotted paths and schema steering, firing no POST", async () => {
    const bodies = captureBodies("post", `${API}/dashboard/:dashboardID/widget/`, fixtures.widgetCreateResponse);

    const error = await createWidgetConfigJSON
      .tool(makeContext(), { dashboard_id: DASHBOARD_ID, configuration: { label: "Broken", type: "gauge" } })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("- `display`");
    expect((error as Error).message).toContain("widget_schema_lookup");
    expect(bodies).toHaveLength(0);
  });
});

describe("update_widget", () => {
  it("sends the exact PUT body for a label-only patch", async () => {
    const bodies = captureBodies("put", `${API}/dashboard/:dashboardID/widget/:widgetID`, "Successfully Updated");

    await invokeTool(updateWidgetConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { label: "Renamed" } });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ label: "Renamed" });
  });

  it("returns a controlled confirmation, never the raw SDK acknowledgment", async () => {
    const submittedLabel = "Renamed sensitive-submitted-sentinel";
    captureBodies("put", `${API}/dashboard/:dashboardID/widget/:widgetID`, `Successfully Updated: ${submittedLabel} sdk-ack-sentinel`);

    const result = await invokeTool(updateWidgetConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { label: submittedLabel } });

    expect(result).toContain(WIDGET_ID);
    expect(result).toMatch(/updated/i);
    expect(result).not.toContain("sdk-ack-sentinel");
    expect(result).not.toContain("Successfully Updated");
  });

  it("refuses a type-change patch with no PUT traffic", async () => {
    const bodies = captureBodies("put", `${API}/dashboard/:dashboardID/widget/:widgetID`, "Successfully Updated");

    const error = await updateWidgetConfigJSON
      .tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { type: "card" } })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("immutable");
    expect(bodies).toHaveLength(0);
  });

  it("passes an explicit null clear through to the wire body", async () => {
    const bodies = captureBodies("put", `${API}/dashboard/:dashboardID/widget/:widgetID`, "Successfully Updated");

    await invokeTool(updateWidgetConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { data: null } });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ data: null });
  });

  it("sends the complete merged display object for a nested patch", async () => {
    const bodies = captureBodies("put", `${API}/dashboard/:dashboardID/widget/:widgetID`, "Successfully Updated");

    await invokeTool(updateWidgetConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { display: { maximum: 500 } } });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ display: { ...fixtures.widgetInfo.display, maximum: 500 } });
  });

  it("rejects an empty patch without any traffic", async () => {
    const infoRequests: string[] = [];
    mockServer.use(
      http.get(`${API}/dashboard/:dashboardID/widget/:widgetID`, ({ params }) => {
        infoRequests.push(params.widgetID as string);
        return ok(fixtures.widgetInfo);
      })
    );
    const bodies = captureBodies("put", `${API}/dashboard/:dashboardID/widget/:widgetID`, "Successfully Updated");

    await expect(invokeTool(updateWidgetConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: {} })).rejects.toThrow(/at least one/);
    expect(infoRequests).toHaveLength(0);
    expect(bodies).toHaveLength(0);
  });
});

// Emulates the first-party PUT contract: no server-side merge; each top-level
// JSON column in the body is replaced wholesale, and analysis_run is cleared
// whenever the body carries anything but a 24-char ID (String(undefined) fails
// that check, so omitting it detaches the widget's Analysis).
describe("update_widget against an API-faithful stateful widget store", () => {
  const ANALYSIS_RUN = "e".repeat(24);
  const STORED_GAUGE = {
    id: WIDGET_ID,
    dashboard: DASHBOARD_ID,
    label: "Tank pressure",
    type: "gauge",
    realtime: null,
    analysis_run: ANALYSIS_RUN,
    display: {
      gauge_type: "solid",
      numberformat: "0",
      minimum: 0,
      maximum: 100,
      unit: "psi",
      theme: { color: { text: "#000000", needle: "#ff0000" } },
    },
  };

  function statefulWidgetStore() {
    const store = { widget: structuredClone(STORED_GAUGE) as Record<string, unknown>, putBodies: [] as Array<Record<string, unknown>> };
    mockServer.use(
      http.get(`${API}/dashboard/:dashboardID/widget/:widgetID`, () => ok(store.widget)),
      http.put(`${API}/dashboard/:dashboardID/widget/:widgetID`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        store.putBodies.push(structuredClone(body));
        const update = { ...body };
        if (String(update.analysis_run).length !== 24) {
          update.analysis_run = null;
        }
        store.widget = { ...store.widget, ...update };
        return ok("Successfully Updated");
      })
    );
    return store;
  }

  it("survives a nested theme change: every unrelated display field and analysis_run persist", async () => {
    const store = statefulWidgetStore();

    await invokeTool(updateWidgetConfigJSON, makeContext(), {
      dashboard_id: DASHBOARD_ID,
      widget_id: WIDGET_ID,
      patch: { display: { theme: { color: { text: "#ffffff" } } } },
    });

    expect(store.putBodies).toHaveLength(1);
    expect(store.putBodies[0]).toEqual({
      display: { ...STORED_GAUGE.display, theme: { color: { text: "#ffffff", needle: "#ff0000" } } },
      analysis_run: ANALYSIS_RUN,
    });
    expect(store.widget.display).toEqual({ ...STORED_GAUGE.display, theme: { color: { text: "#ffffff", needle: "#ff0000" } } });
    expect(store.widget.analysis_run).toBe(ANALYSIS_RUN);
  });

  it("survives a one-level display change", async () => {
    const store = statefulWidgetStore();

    await invokeTool(updateWidgetConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { display: { maximum: 500 } } });

    expect(store.putBodies).toHaveLength(1);
    expect(store.putBodies[0]).toEqual({ display: { ...STORED_GAUGE.display, maximum: 500 }, analysis_run: ANALYSIS_RUN });
    expect(store.widget.display).toEqual({ ...STORED_GAUGE.display, maximum: 500 });
    expect(store.widget.analysis_run).toBe(ANALYSIS_RUN);
  });

  it("survives a label-only change: display column untouched, analysis_run preserved on the wire", async () => {
    const store = statefulWidgetStore();

    await invokeTool(updateWidgetConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { label: "Renamed" } });

    expect(store.putBodies).toHaveLength(1);
    expect(store.putBodies[0]).toEqual({ label: "Renamed", analysis_run: ANALYSIS_RUN });
    expect(store.widget.label).toBe("Renamed");
    expect(store.widget.display).toEqual(STORED_GAUGE.display);
    expect(store.widget.analysis_run).toBe(ANALYSIS_RUN);
  });

  it("clears analysis_run only on an explicit null from the caller", async () => {
    const store = statefulWidgetStore();

    await invokeTool(updateWidgetConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { analysis_run: null } });

    expect(store.putBodies).toHaveLength(1);
    expect(store.putBodies[0]).toEqual({ analysis_run: null });
    expect(store.widget.analysis_run).toBeNull();
  });
});

// A bundled custom widget is an iframe widget whose display carries the
// bundler-written `artifact_url`, a key the pinned dashboard-schema package
// strict-rejects even though the API stores it. The adapter must strip it
// before validation and re-attach it unchanged on the wire, or every update
// on a bundled widget fails (and a display update would detach the artifact).
describe("update_widget on a bundled custom widget", () => {
  const SOURCE_URL = `https://files.example.test/${"f".repeat(24)}/storage/widgets/${WIDGET_ID}.tsx`;
  const ARTIFACT_URL = `https://files.example.test/${"f".repeat(24)}/storage/widgets/.bundled/${WIDGET_ID}/abc123def456.html`;
  const STORED_BUNDLED_IFRAME = {
    id: WIDGET_ID,
    dashboard: DASHBOARD_ID,
    label: "Custom metric",
    type: "iframe",
    realtime: null,
    display: { url: SOURCE_URL, artifact_url: ARTIFACT_URL },
  };

  function bundledWidgetStore() {
    const store = { widget: structuredClone(STORED_BUNDLED_IFRAME) as Record<string, unknown>, putBodies: [] as Array<Record<string, unknown>> };
    mockServer.use(
      http.get(`${API}/dashboard/:dashboardID/widget/:widgetID`, () => ok(store.widget)),
      http.put(`${API}/dashboard/:dashboardID/widget/:widgetID`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        store.putBodies.push(structuredClone(body));
        store.widget = { ...store.widget, ...body };
        return ok("Successfully Updated");
      })
    );
    return store;
  }

  it("accepts a label-only patch and leaves the display column untouched", async () => {
    const store = bundledWidgetStore();

    await invokeTool(updateWidgetConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { label: "Renamed" } });

    expect(store.putBodies).toHaveLength(1);
    expect(store.putBodies[0]).toEqual({ label: "Renamed" });
    expect((store.widget.display as Record<string, unknown>).artifact_url).toBe(ARTIFACT_URL);
  });

  it("preserves artifact_url byte-identical on the wire when the patch touches display", async () => {
    const store = bundledWidgetStore();

    await invokeTool(updateWidgetConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { display: { url: SOURCE_URL } } });

    expect(store.putBodies).toHaveLength(1);
    expect(store.putBodies[0]).toEqual({ display: { url: SOURCE_URL, artifact_url: ARTIFACT_URL } });
    expect((store.widget.display as Record<string, unknown>).artifact_url).toBe(ARTIFACT_URL);
  });

  it("still rejects a caller-supplied display.artifact_url with no PUT traffic", async () => {
    const store = bundledWidgetStore();

    const error = await updateWidgetConfigJSON
      .tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { display: { artifact_url: "https://evil.example/x.html" } } })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("artifact_url");
    expect(store.putBodies).toHaveLength(0);
  });
});

describe("delete_widget placement preflight", () => {
  it("refuses while the widget is referenced in the arrangement, firing no DELETE", async () => {
    let deleteHits = 0;
    mockServer.use(
      http.delete(`${API}/dashboard/:dashboardID/widget/:widgetID`, () => {
        deleteHits += 1;
        return ok("Successfully Removed");
      })
    );

    const error = await deleteWidgetConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("still placed");
    expect((error as Error).message).toContain("update_dashboard");
    expect(deleteHits).toBe(0);
  });

  it("deletes an unreferenced widget", async () => {
    const deletedIds: string[] = [];
    mockServer.use(
      http.delete(`${API}/dashboard/:dashboardID/widget/:widgetID`, ({ params }) => {
        deletedIds.push(params.widgetID as string);
        return ok("Successfully Removed");
      })
    );

    const result = await deleteWidgetConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: fixtures.IDS.widgetUnplaced });

    expect(deletedIds).toEqual([fixtures.IDS.widgetUnplaced]);
    expect(result).toMatch(/permanent/i);
  });

  it("unplacing one widget via update_dashboard preserves the other entry verbatim", async () => {
    const bodies = captureBodies("put", `${API}/dashboard/:dashboardID`, "Successfully Updated");
    // Full desired arrangement: the fixture's arrangement minus IDS.widget's entry.
    const remaining = fixtures.dashboardInfo.arrangement.filter((entry) => entry.widget_id !== WIDGET_ID);

    await updateDashboardConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, arrangement: remaining });

    expect(bodies).toHaveLength(1);
    const sentArrangement = bodies[0].arrangement as Array<Record<string, unknown>>;
    expect(sentArrangement).toContainEqual({ widget_id: fixtures.IDS.widgetOther, x: 4, y: 0, width: 4, height: 2 });
    expect(sentArrangement).toHaveLength(1);
  });
});

describe("widget_schema_lookup", () => {
  it.each(["gauge", "summary"])("returns parseable fenced JSON under the cap for %s", async (type) => {
    const output = await widgetSchemaLookupConfigJSON.tool(makeContext(), { type });

    const serialized = extractFencedJson(output);
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThan(MAX_SCHEMA_RESPONSE_BYTES);
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    expect(parsed.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(output).toContain("PATCH");
  });

  it("returns the update-mode schema when requested", async () => {
    const output = await widgetSchemaLookupConfigJSON.tool(makeContext(), { type: "gauge", mode: "update" });

    expect(output).toContain("update mode");
    expect(() => JSON.parse(extractFencedJson(output))).not.toThrow();
  });

  it("lists all supported types with usage when type is omitted", async () => {
    const output = await widgetSchemaLookupConfigJSON.tool(makeContext(), {});

    expect(output).toContain(`Supported widget types (${WIDGET_TYPES.length})`);
    for (const type of WIDGET_TYPES) {
      expect(output).toContain(`- ${type}`);
    }
    expect(output).toContain("widget_schema_lookup");
  });

  it("rejects an unknown type with an actionable error", async () => {
    await expect(widgetSchemaLookupConfigJSON.tool(makeContext(), { type: "not-a-widget" })).rejects.toThrow(/Invalid `type`.*not-a-widget.*gauge/s);
  });

  it("cap regression: real schemas pass, an artificially oversized schema fails loudly", () => {
    for (const type of WIDGET_TYPES) {
      for (const mode of ["create", "update"] as const) {
        expect(() => serializeWidgetSchema(getWidgetSchema(type, mode)), `${type} ${mode}`).not.toThrow();
      }
    }
    const oversized = { blob: "x".repeat(MAX_SCHEMA_RESPONSE_BYTES + 1) };
    expect(() => serializeWidgetSchema(oversized)).toThrow(/128 KiB.*truncated/s);
  });
});
