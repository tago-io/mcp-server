import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { makeTestContext, TEST_REGION } from "../../testing/context";
import { fixtures } from "../../testing/mocks/fixtures";
import { API, ok } from "../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../testing/mocks/server";
import { createWidgetConfigJSON } from "../dashboards/tools/create-widget";
import { deleteWidgetConfigJSON } from "../dashboards/tools/delete-widget";
import { getCustomWidgetCodeConfigJSON } from "../dashboards/tools/get-custom-widget-code";
import { updateDashboardConfigJSON } from "../dashboards/tools/update-dashboard";
import { updateWidgetConfigJSON } from "../dashboards/tools/update-widget";
import { uploadCustomWidgetCodeConfigJSON } from "../dashboards/tools/upload-custom-widget-code";

const DASHBOARD_ID = fixtures.IDS.dashboard;
const WIDGET_ID = fixtures.IDS.widgetCustom;
const PROFILE_ID = fixtures.IDS.profile;
const REQUEST_TOKEN = "p-FLOW-SENTINEL-TOKEN-cafe-0000000001";

const SOURCE_URL = `https://files.us-e1.tago.io/${PROFILE_ID}/storage/widgets/${WIDGET_ID}.tsx`;
const SIGNED_URL_BASE = `https://storage.tago.example/users/${PROFILE_ID}/storage/widgets/flow-${WIDGET_ID}.tsx`;
const SIGNED_URL = `${SIGNED_URL_BASE}?X-Amz-Signature=flow-signed-sentinel`;

// Sentinel bodies: v1 bundles, the broken body injects a bundle failure, v2 fixes it.
const SOURCE_V1 = 'import React from "npm:react@19.2.3";\nexport default function App() { return <p>flow-source-v1</p>; }\n';
const SOURCE_BROKEN = 'import Broken from "npm:flow-broken-package@0.0.1";\nexport default function App() { return <Broken />; }\n';
const SOURCE_V2 = 'import React from "npm:react@19.2.3";\nexport default function App() { return <p>flow-source-v2</p>; }\n';
const BUNDLE_ERROR = "failed to install flow-broken-package@0.0.1: package not found";

interface FakeWidgetStore {
  created: boolean;
  deleted: boolean;
  widget: Record<string, unknown>;
  arrangement: Array<Record<string, unknown>>;
  /** Decoded source currently stored in Files (null until first upload). */
  storedSource: string | null;
  artifactHash: number;
  uploadBodies: Array<Record<string, unknown>>;
}

function makeContext() {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  return makeTestContext({ resources, token: REQUEST_TOKEN });
}

/**
 * API-faithful stateful fake for the whole loop: widget CRUD, the upload
 * route's writeback semantics (display.url advances on every save; artifact
 * only on bundle success), the signed-URL read path, and the arrangement.
 */
function useStatefulCustomWidgetApi(store: FakeWidgetStore) {
  mockServer.use(
    http.post(`${API}/dashboard/:dashboardID/widget/`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      store.created = true;
      store.widget = { id: WIDGET_ID, dashboard: DASHBOARD_ID, realtime: null, ...body };
      return ok({ widget: WIDGET_ID });
    }),
    http.get(`${API}/dashboard/:dashboardID/widget/:widgetID`, () => {
      if (store.deleted || !store.created) {
        return HttpResponse.json({ status: false, message: "widget can't be found" }, { status: 400 });
      }
      return ok(store.widget);
    }),
    http.put(`${API}/dashboard/:dashboardID/widget/:widgetID`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      store.widget = { ...store.widget, ...body };
      return ok("Successfully Updated");
    }),
    http.delete(`${API}/dashboard/:dashboardID/widget/:widgetID`, () => {
      store.deleted = true;
      return ok("Successfully Removed");
    }),
    http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, async ({ request }) => {
      const body = (await request.json()) as { file: string; file_name: string };
      store.uploadBodies.push({ ...body });
      const source = Buffer.from(body.file, "base64").toString("utf8");
      // Source is saved and display.url advances on EVERY accepted upload.
      store.storedSource = source;
      const display: Record<string, unknown> = { ...(store.widget.display as Record<string, unknown>), url: SOURCE_URL };
      const bundles = !source.includes("flow-broken-package");
      if (bundles) {
        store.artifactHash += 1;
        display.artifact_url = `https://files.us-e1.tago.io/${PROFILE_ID}/storage/widgets/.bundled/${WIDGET_ID}/hash${store.artifactHash}.html`;
      }
      store.widget = { ...store.widget, display };
      return ok({
        url: SOURCE_URL,
        artifact_hash: bundles ? `hash${store.artifactHash}` : null,
        artifact_url: bundles ? (display.artifact_url as string) : null,
        bytes: bundles ? source.length : null,
        success: bundles,
        error: bundles ? null : BUNDLE_ERROR,
        warnings: [],
      });
    }),
    http.get(`${API}/file/:profileID/widgets/:fileName`, () => {
      if (store.storedSource === null) {
        return HttpResponse.json({ status: false, message: "file can't be found" }, { status: 404 });
      }
      return ok(SIGNED_URL);
    }),
    http.get(SIGNED_URL_BASE, () => {
      if (store.storedSource === null) {
        return new HttpResponse("not found", { status: 404 });
      }
      return HttpResponse.text(store.storedSource);
    }),
    http.get(`${API}/dashboard/:dashboardID`, () => ok({ ...fixtures.dashboardInfo, arrangement: store.arrangement })),
    http.put(`${API}/dashboard/:dashboardID`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      if (Array.isArray(body.arrangement)) {
        store.arrangement = body.arrangement as Array<Record<string, unknown>>;
      }
      return ok("Successfully Updated");
    })
  );
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("custom-widget development flow", () => {
  it("runs create → upload → read → bundle failure → fix → re-upload → placement → cleanup without leaking secrets", async () => {
    const context = makeContext();
    const transcript: string[] = [];
    async function step(promise: Promise<string>): Promise<string> {
      const output = await promise;
      transcript.push(output);
      return output;
    }

    const store: FakeWidgetStore = {
      created: false,
      deleted: false,
      widget: {},
      arrangement: [{ widget_id: fixtures.IDS.widgetOther, x: 4, y: 0, width: 4, height: 2 }],
      storedSource: null,
      artifactHash: 0,
      uploadBodies: [],
    };
    useStatefulCustomWidgetApi(store);

    // 1. Create the URL-less iframe widget (unplaced by contract).
    const created = await step(createWidgetConfigJSON.tool(context, { dashboard_id: DASHBOARD_ID, configuration: { label: "Flow Metric", type: "iframe", display: { url: "" } } }));
    expect(created).toContain(WIDGET_ID);
    expect(created).toContain("NOT yet placed");
    expect(store.created).toBe(true);

    // 2. Reading before any upload is the bootstrap answer, not an error.
    const bootstrap = await step(getCustomWidgetCodeConfigJSON.tool(context, { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID }));
    expect(bootstrap).toContain("No source has been authored yet");
    expect(bootstrap).toContain("upload_custom_widget_code");

    const uploadedV1 = await step(uploadCustomWidgetCodeConfigJSON.tool(context, { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SOURCE_V1 }));
    expect(uploadedV1).toContain("bundled successfully");
    expect(store.uploadBodies[0]).toEqual({ file: Buffer.from(SOURCE_V1, "utf8").toString("base64"), file_name: "widget.tsx" });
    const displayAfterV1 = store.widget.display as Record<string, unknown>;
    expect(displayAfterV1.url).toBe(SOURCE_URL);
    expect(displayAfterV1.artifact_url).toContain("hash1");

    const readBackV1 = await step(getCustomWidgetCodeConfigJSON.tool(context, { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID }));
    expect(readBackV1).toContain(SOURCE_V1);
    expect(readBackV1).toContain("bundled artifact exists");

    // 5. Bundle-failure injection: source saved, artifact preserved, sanitized error surfaced as a fixable caveat.
    const uploadedBroken = await step(uploadCustomWidgetCodeConfigJSON.tool(context, { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SOURCE_BROKEN }));
    expect(uploadedBroken).toContain("bundle FAILED");
    expect(uploadedBroken).toContain(BUNDLE_ERROR);
    expect(store.storedSource).toBe(SOURCE_BROKEN);
    const displayAfterBreak = store.widget.display as Record<string, unknown>;
    expect(displayAfterBreak.artifact_url).toContain("hash1"); // previous build keeps rendering

    const readBackBroken = await step(getCustomWidgetCodeConfigJSON.tool(context, { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID }));
    expect(readBackBroken).toContain("flow-broken-package");

    const uploadedV2 = await step(uploadCustomWidgetCodeConfigJSON.tool(context, { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SOURCE_V2 }));
    expect(uploadedV2).toContain("bundled successfully");
    expect((store.widget.display as Record<string, unknown>).artifact_url).toContain("hash2");

    // 8. A label-only update on the bundled widget passes validation and preserves the artifact (adapter compensation).
    const relabeled = await step(updateWidgetConfigJSON.tool(context, { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { label: "Flow Metric v2" } }));
    expect(relabeled).toMatch(/updated/i);
    expect((store.widget.display as Record<string, unknown>).artifact_url).toContain("hash2");

    // 9. Placement: the full desired arrangement, preserving the unrelated entry.
    const placed = await step(
      updateDashboardConfigJSON.tool(context, {
        dashboard_id: DASHBOARD_ID,
        arrangement: [...store.arrangement, { widget_id: WIDGET_ID, x: 0, y: 0, width: 4, height: 2 }] as never,
      })
    );
    expect(placed).toMatch(/updated/i);
    expect(store.arrangement).toContainEqual({ widget_id: WIDGET_ID, x: 0, y: 0, width: 4, height: 2 });
    expect(store.arrangement).toContainEqual({ widget_id: fixtures.IDS.widgetOther, x: 4, y: 0, width: 4, height: 2 });

    // 10. Cleanup: unplace first (delete_widget refuses placed widgets), then delete.
    const unplaced = await step(
      updateDashboardConfigJSON.tool(context, { dashboard_id: DASHBOARD_ID, arrangement: store.arrangement.filter((entry) => entry.widget_id !== WIDGET_ID) as never })
    );
    expect(unplaced).toMatch(/updated/i);
    const deleted = await step(deleteWidgetConfigJSON.tool(context, { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID }));
    expect(deleted).toMatch(/permanent/i);
    expect(store.deleted).toBe(true);

    const uploadOutputs = [created, bootstrap, uploadedV1, uploadedBroken, uploadedV2, relabeled, placed, unplaced, deleted];
    for (const output of transcript) {
      expect(output, "credential must never render").not.toContain(REQUEST_TOKEN);
      expect(output, "signed URL must never render").not.toContain("X-Amz-Signature");
      expect(output, "signed URL host path must never render").not.toContain(SIGNED_URL_BASE);
    }
    // Submitted source renders ONLY through the read tool, never from uploads.
    for (const output of uploadOutputs) {
      expect(output).not.toContain("flow-source-v1");
      expect(output).not.toContain("flow-source-v2");
      expect(output).not.toContain(Buffer.from(SOURCE_V1, "utf8").toString("base64"));
    }
  });
});
