import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { API, ok } from "../../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { createDashboardConfigJSON } from "../create-dashboard";
import { createWidgetConfigJSON } from "../create-widget";
import { deleteDashboardConfigJSON } from "../delete-dashboard";
import { deleteWidgetConfigJSON } from "../delete-widget";
import { getDashboardConfigJSON } from "../get-dashboard";
import { updateDashboardConfigJSON } from "../update-dashboard";
import { updateWidgetConfigJSON } from "../update-widget";

const DASHBOARD_ID = fixtures.IDS.dashboard;
const WIDGET_A_ID = fixtures.IDS.widgetOther;
const WIDGET_B_ID = fixtures.IDS.widget;
const REQUEST_TOKEN = "a-0000000000000000000000000000000000";

interface ArrangementEntry {
  widget_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FakeDashboard {
  created: boolean;
  deleted: boolean;
  label: string;
  arrangement: ArrangementEntry[];
  widgets: Map<string, Record<string, unknown>>;
  widgetDeleteHits: number;
}

function makeContext() {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  return makeTestContext({ resources, token: REQUEST_TOKEN });
}

/** Stateful handlers closing over one mutable fake dashboard record. */
function useStatefulDashboard(record: FakeDashboard) {
  const widgetIdQueue = [WIDGET_A_ID, WIDGET_B_ID];

  mockServer.use(
    http.post(`${API}/dashboard`, async ({ request }) => {
      const body = (await request.json()) as { label: string };
      record.created = true;
      record.label = body.label;
      return ok({ dashboard: DASHBOARD_ID });
    }),
    http.post(`${API}/dashboard/:dashboardID/widget/`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      const widgetId = widgetIdQueue.shift() as string;
      record.widgets.set(widgetId, { id: widgetId, dashboard: DASHBOARD_ID, realtime: null, ...body });
      return ok({ widget: widgetId });
    }),
    http.get(`${API}/dashboard/:dashboardID/widget/:widgetID`, ({ params }) => {
      const widget = record.widgets.get(params.widgetID as string);
      return widget ? ok(widget) : HttpResponse.json({ status: false, message: "Widget Not Found" }, { status: 404 });
    }),
    http.put(`${API}/dashboard/:dashboardID/widget/:widgetID`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      const widget = record.widgets.get(params.widgetID as string) as Record<string, unknown>;
      record.widgets.set(params.widgetID as string, { ...widget, ...body });
      return ok("Successfully Updated");
    }),
    http.delete(`${API}/dashboard/:dashboardID/widget/:widgetID`, ({ params }) => {
      record.widgetDeleteHits += 1;
      record.widgets.delete(params.widgetID as string);
      return ok("Successfully Removed");
    }),
    http.get(`${API}/dashboard/:dashboardID`, () =>
      record.deleted
        ? HttpResponse.json({ status: false, message: "Dashboard Not Found" }, { status: 404 })
        : ok({
            id: DASHBOARD_ID,
            label: record.label,
            type: "dashboard",
            visible: true,
            tabs: [],
            arrangement: record.arrangement,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z",
            last_access: null,
          })
    ),
    http.put(`${API}/dashboard/:dashboardID`, async ({ request }) => {
      const body = (await request.json()) as { label?: string; arrangement?: ArrangementEntry[] };
      if (body.label !== undefined) {
        record.label = body.label;
      }
      if (body.arrangement !== undefined) {
        record.arrangement = body.arrangement;
      }
      return ok("Successfully Updated");
    }),
    http.delete(`${API}/dashboard/:dashboardID`, () => {
      record.deleted = true;
      return ok("Successfully Removed");
    })
  );
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("dashboard authoring flow", () => {
  it("drives create → widgets → placement → repair → guarded delete → cleanup with failure injections and no token leaks", async () => {
    const record: FakeDashboard = { created: false, deleted: false, label: "", arrangement: [], widgets: new Map(), widgetDeleteHits: 0 };
    useStatefulDashboard(record);
    const context = makeContext();
    // Every tool output and error message across the flow, checked at the end
    // against the request token.
    const transcript: string[] = [];

    async function call(config: { tool: (ctx: typeof context, params: never) => Promise<string> }, params: Record<string, unknown>): Promise<string> {
      const output = await config.tool(context, params as never);
      transcript.push(output);
      return output;
    }

    async function callExpectingError(config: { tool: (ctx: typeof context, params: never) => Promise<string> }, params: Record<string, unknown>): Promise<string> {
      const caught = await config.tool(context, params as never).then(
        () => undefined,
        (error) => error as unknown
      );
      expect(caught).toBeDefined();
      const message = caught instanceof Error ? caught.message : String(caught);
      transcript.push(message);
      return message;
    }

    const created = await call(createDashboardConfigJSON, { label: "Flow Dashboard" });
    expect(created).toContain(DASHBOARD_ID);
    expect(record.created).toBe(true);

    // Widget A (unrelated bystander) created and placed.
    await call(createWidgetConfigJSON, {
      dashboard_id: DASHBOARD_ID,
      configuration: { label: "Bystander", type: "gauge", display: { gauge_type: "solid", numberformat: "0", minimum: 0, maximum: 100 } },
    });
    const widgetAEntry = { widget_id: WIDGET_A_ID, x: 0, y: 0, width: 4, height: 2 };
    await call(updateDashboardConfigJSON, { dashboard_id: DASHBOARD_ID, arrangement: [widgetAEntry] });
    expect(record.arrangement).toEqual([widgetAEntry]);

    // Widget B create failure injection: a client-error response yields a
    // controlled error and the flow retries. (5xx is unusable here: the SDK
    // transparently retries server errors with multi-second backoff.)
    mockServer.use(http.post(`${API}/dashboard/:dashboardID/widget/`, () => HttpResponse.json({ status: false, message: "Widget rejected" }, { status: 400 }), { once: true }));
    await callExpectingError(createWidgetConfigJSON, {
      dashboard_id: DASHBOARD_ID,
      configuration: { label: "Tank Level", type: "gauge", display: { gauge_type: "solid", numberformat: "0", minimum: 0, maximum: 100 } },
    });
    expect(record.widgets.has(WIDGET_B_ID)).toBe(false);

    const widgetCreated = await call(createWidgetConfigJSON, {
      dashboard_id: DASHBOARD_ID,
      configuration: { label: "Tank Level", type: "gauge", display: { gauge_type: "solid", numberformat: "0", minimum: 0, maximum: 100 } },
    });
    expect(widgetCreated).toContain(WIDGET_B_ID);
    expect(widgetCreated).toContain("NOT yet placed");

    // Place widget B: full arrangement including the preexisting entry.
    const widgetBEntry = { widget_id: WIDGET_B_ID, x: 4, y: 0, width: 4, height: 2 };
    await call(updateDashboardConfigJSON, { dashboard_id: DASHBOARD_ID, arrangement: [widgetAEntry, widgetBEntry] });
    expect(record.arrangement).toEqual([widgetAEntry, widgetBEntry]);

    const dashboardView = await call(getDashboardConfigJSON, { dashboard_id: DASHBOARD_ID });
    expect(dashboardView).toContain(WIDGET_A_ID);
    expect(dashboardView).toContain(WIDGET_B_ID);

    const invalidUpdate = await callExpectingError(updateWidgetConfigJSON, { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_B_ID, patch: { display: { bogus_key: 1 } } });
    expect(invalidUpdate).toContain("widget_schema_lookup");
    expect((record.widgets.get(WIDGET_B_ID) as { label: string }).label).toBe("Tank Level");

    await call(updateWidgetConfigJSON, { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_B_ID, patch: { label: "Fill Level", display: { maximum: 500 } } });
    expect(record.widgets.get(WIDGET_B_ID)).toMatchObject({ label: "Fill Level" });

    const guarded = await callExpectingError(deleteWidgetConfigJSON, { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_B_ID });
    expect(guarded).toContain("still placed");
    expect(guarded).toContain("update_dashboard");
    expect(record.widgetDeleteHits).toBe(0);

    // Unplace widget B; widget A's entry stays present.
    await call(updateDashboardConfigJSON, { dashboard_id: DASHBOARD_ID, arrangement: [widgetAEntry] });
    expect(record.arrangement).toEqual([widgetAEntry]);

    await call(deleteWidgetConfigJSON, { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_B_ID });
    expect(record.widgetDeleteHits).toBe(1);
    expect(record.widgets.has(WIDGET_B_ID)).toBe(false);

    mockServer.use(
      http.delete(`${API}/dashboard/:dashboardID`, () => HttpResponse.json({ status: false, message: `Could not remove dashboard ${DASHBOARD_ID}` }, { status: 400 }), {
        once: true,
      })
    );
    const deleteError = await callExpectingError(deleteDashboardConfigJSON, { dashboard_id: DASHBOARD_ID });
    expect(deleteError).toContain(DASHBOARD_ID);
    expect(record.deleted).toBe(false);

    await call(deleteDashboardConfigJSON, { dashboard_id: DASHBOARD_ID });
    expect(record.deleted).toBe(true);

    await callExpectingError(getDashboardConfigJSON, { dashboard_id: DASHBOARD_ID });

    // The request credential never crossed any output or error in the whole
    // flow (dashboards carry no fixture secrets of their own).
    expect(transcript.length).toBeGreaterThan(0);
    for (const output of transcript) {
      expect(output).not.toContain(REQUEST_TOKEN);
    }
  });
});
