import { Resources } from "@tago-io/sdk";
import { http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { invokeTool } from "../../../../testing/invoke-tool";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { API, ok } from "../../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { createDashboardConfigJSON } from "../create-dashboard";
import { deleteDashboardConfigJSON } from "../delete-dashboard";
import { getDashboardConfigJSON } from "../get-dashboard";
import { searchDashboardsConfigJSON } from "../search-dashboards";
import { updateDashboardConfigJSON } from "../update-dashboard";

const DASHBOARD_ID = fixtures.IDS.dashboard;
const REQUEST_TOKEN = "a-0000000000000000000000000000000000";

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

/** Records EVERY outbound SDK request (method + path), including profile lookups. */
function trackAllRequests() {
  const requests: string[] = [];
  mockServer.events.on("request:start", ({ request }) => {
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  return requests;
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => {
  mockServer.resetHandlers();
  mockServer.events.removeAllListeners();
});
afterAll(() => mockServer.close());

describe("create_dashboard wire bodies", () => {
  it("sends ONLY the caller's keys: no id, profile, timestamps, or injected defaults", async () => {
    const bodies = captureBodies("post", `${API}/dashboard`, fixtures.dashboardCreateResponse);

    await createDashboardConfigJSON.tool(makeContext(), { label: "Fleet Overview" });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ label: "Fleet Overview" });
  });

  it("sends tabs, arrangement, tags, and visible exactly as supplied", async () => {
    const bodies = captureBodies("post", `${API}/dashboard`, fixtures.dashboardCreateResponse);
    const params = {
      label: "Fleet Overview",
      tabs: [{ key: "overview", value: "Overview" }],
      arrangement: [{ widget_id: fixtures.IDS.widget, x: 0, y: 0, width: 4, height: 2 }],
      tags: [{ key: "team", value: "ops" }],
      visible: true,
    };

    const result = await createDashboardConfigJSON.tool(makeContext(), params);

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual(params);
    expect(result).toContain(DASHBOARD_ID);
    expect(result).toContain("create_widget");
    expect(result).toContain("update_dashboard");
  });

  it("rejects duplicate tab keys with ZERO outbound requests, not even the profile lookup", async () => {
    const requests = trackAllRequests();
    const tabs = [
      { key: "main", value: "Main" },
      { key: "main", value: "Duplicate" },
    ];

    await expect(createDashboardConfigJSON.tool(makeContext(), { label: "Dupes", tabs })).rejects.toThrow(/tabs.*"main"/s);
    expect(requests).toEqual([]);
  });

  it("surfaces schema issues for an invalid label type with ZERO outbound requests", async () => {
    const requests = trackAllRequests();

    const error = await createDashboardConfigJSON.tool(makeContext(), { label: 123 as never }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("label");
    expect((error as Error).message).toContain("Fix the listed paths");
    expect(requests).toEqual([]);
  });

  it("fetches the profile exactly once for a valid create, then sends the sanitized body", async () => {
    const requests = trackAllRequests();
    const bodies = captureBodies("post", `${API}/dashboard`, fixtures.dashboardCreateResponse);

    await createDashboardConfigJSON.tool(makeContext(), { label: "Fleet Overview" });

    expect(requests).toEqual(["GET /profile/current", "POST /dashboard"]);
    expect(bodies).toEqual([{ label: "Fleet Overview" }]);
  });

  it("sends tab conditions with ONLY the caller's keys; no package-injected resource default", async () => {
    const bodies = captureBodies("post", `${API}/dashboard`, fixtures.dashboardCreateResponse);
    const tabs = [{ key: "main", value: "Main", conditions: [{ key: "role", value: "admin" }] }];

    await createDashboardConfigJSON.tool(makeContext(), { label: "Conditional", tabs });

    expect(bodies).toEqual([{ label: "Conditional", tabs }]);
  });
});

describe("update_dashboard wire bodies", () => {
  it("sends the exact PUT body for a label-only edit; no merged current fields", async () => {
    const bodies = captureBodies("put", `${API}/dashboard/:dashboardID`, "Successfully Updated");

    await invokeTool(updateDashboardConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, label: "Renamed" });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ label: "Renamed" });
  });

  it("returns a controlled confirmation, never the raw SDK acknowledgment", async () => {
    const submittedLabel = "Renamed sensitive-submitted-sentinel";
    captureBodies("put", `${API}/dashboard/:dashboardID`, `Successfully Updated: ${submittedLabel} sdk-ack-sentinel`);

    const result = await invokeTool(updateDashboardConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, label: submittedLabel });

    expect(result).toContain(DASHBOARD_ID);
    expect(result).toMatch(/updated/i);
    expect(result).not.toContain("sdk-ack-sentinel");
    expect(result).not.toContain("Successfully Updated");
  });

  it("sends a tabs update as exactly the new tabs array", async () => {
    const bodies = captureBodies("put", `${API}/dashboard/:dashboardID`, "Successfully Updated");
    const tabs = [
      { key: "overview", value: "Overview" },
      { key: "alerts", value: "Alerts" },
    ];

    await invokeTool(updateDashboardConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, tabs });

    expect(bodies[0]).toEqual({ tabs });
  });

  it("replaces the arrangement atomically with exactly the supplied array", async () => {
    const bodies = captureBodies("put", `${API}/dashboard/:dashboardID`, "Successfully Updated");
    // The fixture dashboard has two placed widgets; sending one entry unplaces the other.
    const arrangement = [{ widget_id: fixtures.IDS.widgetOther, x: 4, y: 0, width: 4, height: 2 }];

    await invokeTool(updateDashboardConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, arrangement });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ arrangement });
  });

  it("rejects duplicate tab keys on update with no PUT traffic", async () => {
    const bodies = captureBodies("put", `${API}/dashboard/:dashboardID`, "Successfully Updated");
    const tabs = [
      { key: "x", value: "A" },
      { key: "x", value: "B" },
    ];

    await expect(invokeTool(updateDashboardConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID, tabs })).rejects.toThrow(/tabs.*"x"/s);
    expect(bodies).toHaveLength(0);
  });

  it("rejects an update with zero editable fields without any traffic", async () => {
    const infoRequests: string[] = [];
    mockServer.use(
      http.get(`${API}/dashboard/:dashboardID`, ({ params }) => {
        infoRequests.push(params.dashboardID as string);
        return ok(fixtures.dashboardInfo);
      })
    );
    const bodies = captureBodies("put", `${API}/dashboard/:dashboardID`, "Successfully Updated");

    await expect(invokeTool(updateDashboardConfigJSON, makeContext(), { dashboard_id: DASHBOARD_ID })).rejects.toThrow(/at least one field/);
    expect(infoRequests).toHaveLength(0);
    expect(bodies).toHaveLength(0);
  });
});

describe("delete_dashboard", () => {
  it("sends DELETE to the dashboard path and reports permanence including widgets", async () => {
    const deletedIds: string[] = [];
    mockServer.use(
      http.delete(`${API}/dashboard/:dashboardID`, ({ params }) => {
        deletedIds.push(params.dashboardID as string);
        return ok("Successfully Removed");
      })
    );

    const result = await deleteDashboardConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID });

    expect(deletedIds).toEqual([DASHBOARD_ID]);
    expect(result).toContain(DASHBOARD_ID);
    expect(result).toMatch(/permanent/i);
    expect(result).toMatch(/widget/i);
  });
});

describe("search_dashboards and get_dashboard rendering", () => {
  it("lists dashboards by label with explicit fields (never the SDK id/name default)", async () => {
    let requestedFields = "";
    mockServer.use(
      http.get(`${API}/dashboard`, ({ request }) => {
        requestedFields = new URL(request.url).searchParams.toString();
        return ok([fixtures.dashboardListItem]);
      })
    );

    const output = await searchDashboardsConfigJSON.tool(makeContext(), { filter: { label: "fleet" } });

    expect(output).toContain("Fleet Overview");
    expect(requestedFields).toContain("label");
    expect(requestedFields).toContain("*fleet*");
  });

  it("renders SDK-parsed Date timestamps meaningfully after token-field stripping", async () => {
    const info = async () => ({
      ...fixtures.dashboardInfo,
      token: "dash-cap-token-should-never-print",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-02T00:00:00.000Z"),
      last_access: new Date("2026-01-03T00:00:00.000Z"),
    });
    const context = makeTestContext({ resources: { dashboards: { info } } });

    const output = await getDashboardConfigJSON.tool(context, { dashboard_id: DASHBOARD_ID });

    expect(output).toContain("2026-01-01");
    expect(output).toContain("2026-01-02");
    expect(output).not.toContain("dash-cap-token-should-never-print");
  });

  it("renders the arrangement in the concise get view so placement is manageable", async () => {
    const output = await getDashboardConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID });

    expect(output).toContain(fixtures.IDS.widget);
    expect(output).toContain(fixtures.IDS.widgetOther);
    expect(output).toContain("Fleet Overview");
  });
});
