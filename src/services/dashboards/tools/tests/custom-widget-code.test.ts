import { Resources } from "@tago-io/sdk";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { API, ok } from "../../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { parseWidgetSourcePath } from "../../custom-widget-source";
import { getCustomWidgetCodeConfigJSON } from "../get-custom-widget-code";
import { MAX_WIDGET_SOURCE_BYTES, uploadCustomWidgetCodeConfigJSON } from "../upload-custom-widget-code";

const DASHBOARD_ID = fixtures.IDS.dashboard;
const WIDGET_ID = fixtures.IDS.widgetCustom;
const PROFILE_ID = fixtures.IDS.profile;
const REQUEST_TOKEN = "p-feedfacefeedfacefeedfacefeedface1234";
const SENTINEL_SOURCE = 'const secret = "sentinel-source-body"; export default secret;';
const SENTINEL_SOURCE_B64 = Buffer.from(SENTINEL_SOURCE, "utf8").toString("base64");

function makeContext() {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  return makeTestContext({ resources, token: REQUEST_TOKEN });
}

function useWidget(widget: Record<string, unknown>) {
  mockServer.use(http.get(`${API}/dashboard/:dashboardID/widget/:widgetID`, () => ok(widget)));
}

function customWidget(displayOverrides: Record<string, unknown>): Record<string, unknown> {
  return { ...fixtures.widgetCustomInfo, display: { ...fixtures.widgetCustomInfo.display, ...displayOverrides } };
}

function useUploadOutcome(outcomeOverrides: Record<string, unknown>) {
  const bodies: Array<Record<string, unknown>> = [];
  mockServer.use(
    http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return ok({ ...fixtures.widgetUploadResponse, ...outcomeOverrides });
    })
  );
  return bodies;
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("parseWidgetSourcePath matrix", () => {
  const cases: Array<[string, string, string | null]> = [
    ["files-host storage shape", `https://files.us-e1.tago.io/${PROFILE_ID}/storage/widgets/${WIDGET_ID}.tsx`, `widgets/${WIDGET_ID}.tsx`],
    ["api-host file shape", `https://api.us-e1.tago.io/file/${PROFILE_ID}/widgets/${WIDGET_ID}.tsx`, `widgets/${WIDGET_ID}.tsx`],
    ["legacy files host (us-e1 alias)", `https://files.tago.io/${PROFILE_ID}/storage/widgets/${WIDGET_ID}.tsx`, `widgets/${WIDGET_ID}.tsx`],
    ["uppercase extension", `https://files.tago.io/${PROFILE_ID}/storage/widgets/w.TSX`, "widgets/w.TSX"],
    ["external host", `https://evil.example/${PROFILE_ID}/storage/widgets/${WIDGET_ID}.tsx`, null],
    ["host with riding port", `https://files.tago.io:8443/${PROFILE_ID}/storage/widgets/${WIDGET_ID}.tsx`, null],
    ["userinfo trick", `https://files.tago.io@evil.example/${PROFILE_ID}/storage/widgets/${WIDGET_ID}.tsx`, null],
    ["http scheme", `http://files.tago.io/${PROFILE_ID}/storage/widgets/${WIDGET_ID}.tsx`, null],
    ["other profile", `https://files.tago.io/ffffffffffffffffffffffff/storage/widgets/${WIDGET_ID}.tsx`, null],
    ["profile prefix smuggle", `https://files.tago.io/x${PROFILE_ID}/storage/widgets/${WIDGET_ID}.tsx`, null],
    ["html extension", `https://files.tago.io/${PROFILE_ID}/storage/widgets/${WIDGET_ID}.html`, null],
    ["js extension", `https://files.tago.io/${PROFILE_ID}/storage/widgets/${WIDGET_ID}.js`, null],
    ["literal traversal", `https://files.tago.io/${PROFILE_ID}/storage/../other/${WIDGET_ID}.tsx`, null],
    ["encoded traversal", `https://files.tago.io/${PROFILE_ID}/storage/%2e%2e/other/${WIDGET_ID}.tsx`, null],
    ["empty segment", `https://files.tago.io/${PROFILE_ID}/storage//widgets/${WIDGET_ID}.tsx`, null],
    ["malformed percent-encoding", `https://files.tago.io/${PROFILE_ID}/storage/widgets/%zz.tsx`, null],
    ["not a URL", "not a url", null],
  ];

  it.each(cases)("%s", (_label, rawUrl, expected) => {
    expect(parseWidgetSourcePath(rawUrl, PROFILE_ID, TEST_REGION)).toBe(expected);
  });

  it("contains literal dot-dot via WHATWG URL normalization: the resolved path stays inside the profile prefix", () => {
    expect(parseWidgetSourcePath(`https://files.tago.io/${PROFILE_ID}/storage/a/../b.tsx`, PROFILE_ID, TEST_REGION)).toBe("b.tsx");
    // A dot-dot that would climb OUT of the storage prefix breaks the prefix match and is rejected.
    expect(parseWidgetSourcePath(`https://files.tago.io/${PROFILE_ID}/storage/../${PROFILE_ID}/storage/x.tsx`, PROFILE_ID, TEST_REGION)).toBeNull();
  });
});

describe("get_custom_widget_code", () => {
  it("returns the fresh source with bundle state, never the signed URL", async () => {
    const result = await getCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID });

    expect(result).toContain(fixtures.widgetSource);
    expect(result).toContain("bundled artifact exists");
    expect(result).toContain("```tsx");
    expect(result).not.toContain("X-Amz-Signature");
    expect(result).not.toContain("widget-signed-url-sentinel");
    expect(result).not.toContain(REQUEST_TOKEN);
  });

  it("reports the never-bundled state when artifact_url is absent", async () => {
    useWidget(customWidget({ artifact_url: undefined }));

    const result = await getCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID });

    expect(result).toContain("never bundled successfully");
  });

  it("refuses a non-iframe widget with steering", async () => {
    useWidget(fixtures.widgetInfo);

    const error = await getCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: fixtures.IDS.widget }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('"gauge"');
    expect((error as Error).message).toContain("iframe");
  });

  it("answers bootstrap guidance for an empty display.url without any file traffic", async () => {
    let fileHits = 0;
    mockServer.use(
      http.get(`${API}/file/:profileID/widgets/:fileName`, () => {
        fileHits += 1;
        return ok(fixtures.widgetSourceSignedUrl);
      })
    );
    useWidget(customWidget({ url: "", artifact_url: undefined }));

    const result = await getCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID });

    expect(result).toContain("No source has been authored yet");
    expect(result).toContain("upload_custom_widget_code");
    expect(fileHits).toBe(0);
  });

  it("answers bootstrap guidance when the wired file does not exist (404 signed resolution)", async () => {
    mockServer.use(http.get(`${API}/file/:profileID/widgets/:fileName`, () => HttpResponse.json({ status: false, message: "file can't be found" }, { status: 404 })));

    const result = await getCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID });

    expect(result).toContain("does not exist in TagoIO Files yet");
    expect(result).toContain("upload_custom_widget_code");
  });

  it("answers bootstrap guidance when the storage host 404s the signed URL", async () => {
    mockServer.use(http.get(fixtures.widgetSourceSignedUrl.split("?")[0], () => new HttpResponse("not found", { status: 404 })));

    const result = await getCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID });

    expect(result).toContain("does not exist in TagoIO Files yet");
  });

  it("names the path mismatch when display.url is wired to a non-canonical profile-owned file", async () => {
    mockServer.use(http.get(`${API}/file/:profileID/widgets/:fileName`, () => HttpResponse.json({ status: false, message: "file can't be found" }, { status: 404 })));
    useWidget(customWidget({ url: `https://files.tago.io/${PROFILE_ID}/storage/legacy/manual.tsx` }));

    const result = await getCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID });

    expect(result).toContain('"legacy/manual.tsx"');
    expect(result).toContain(`widgets/${WIDGET_ID}.tsx`);
    expect(result).toContain("upload_custom_widget_code");
  });

  it.each([
    ["external host", "https://evil.example/storage/widgets/x.tsx"],
    ["other profile", `https://files.tago.io/ffffffffffffffffffffffff/storage/widgets/x.tsx`],
    ["html file", `https://files.tago.io/${PROFILE_ID}/storage/widgets/x.html`],
    ["traversal", `https://files.tago.io/${PROFILE_ID}/storage/../escape.tsx`],
  ])("refuses a display.url outside the matrix (%s) with recovery steering and no fetch", async (_label, url) => {
    let fileHits = 0;
    mockServer.use(
      http.get(`${API}/file/:profileID/widgets/:fileName`, () => {
        fileHits += 1;
        return ok(fixtures.widgetSourceSignedUrl);
      })
    );
    useWidget(customWidget({ url }));

    const result = await getCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID });

    expect(result).toContain("does not point at a .tsx file inside this profile's TagoIO Files storage");
    expect(result).toContain("update_widget");
    expect(fileHits).toBe(0);
  });
});

describe("upload_custom_widget_code", () => {
  it("sends the base64-encoded source as {file, file_name} and reports bundle success with warnings", async () => {
    const bodies = useUploadOutcome({ warnings: ["react: no version specified, resolving to latest — pin a version"] });

    const result = await uploadCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SENTINEL_SOURCE });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ file: SENTINEL_SOURCE_B64, file_name: "widget.tsx" });
    expect(result).toContain("bundled successfully");
    expect(result).toContain("pin a version");
    expect(result).not.toContain(SENTINEL_SOURCE);
    expect(result).not.toContain(SENTINEL_SOURCE_B64);
  });

  it("reports a bundle failure as a fixable caveat with the sanitized error verbatim, not a thrown error", async () => {
    useUploadOutcome({ success: false, error: "conflicting versions for react: 18 vs 19 — one version per package", artifact_hash: null, artifact_url: null });

    const result = await uploadCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SENTINEL_SOURCE });

    expect(result).toContain("bundle FAILED");
    expect(result).toContain("conflicting versions for react");
    expect(result).toContain("previous successful build");
    expect(result).toContain("upload_custom_widget_code again");
    expect(result).not.toContain(SENTINEL_SOURCE);
    expect(result).not.toContain(SENTINEL_SOURCE_B64);
  });

  it("reports the feature-disabled deployment state distinctly", async () => {
    useUploadOutcome({ success: false, error: "widget bundler is not enabled on this deployment", artifact_hash: null, artifact_url: null });

    const result = await uploadCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SENTINEL_SOURCE });

    expect(result).toContain("feature disabled");
    expect(result).toContain("operator");
  });

  it("reports the outdated-bundler deployment state distinctly", async () => {
    useUploadOutcome({ success: false, error: "widget bundler is outdated on this deployment", artifact_hash: null, artifact_url: null });

    const result = await uploadCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SENTINEL_SOURCE });

    expect(result).toContain("outdated");
    expect(result).toContain("previous build");
  });

  it("reports a bundler invocation failure as infrastructure, not a source problem", async () => {
    useUploadOutcome({ success: false, error: "bundler invocation failed", artifact_hash: null, artifact_url: null });

    const result = await uploadCustomWidgetCodeConfigJSON.tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SENTINEL_SOURCE });

    expect(result).toContain("infrastructure");
    expect(result).toContain("Retry the upload later");
    expect(result).not.toContain("Fix the source");
  });

  it("redacts the plaintext source from a quota failure that reflects it", async () => {
    mockServer.use(
      http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () =>
        HttpResponse.json({ status: false, message: `You have exceeded the maximum limit of File Storage while storing ${SENTINEL_SOURCE}` }, { status: 400 })
      )
    );

    const error = await uploadCustomWidgetCodeConfigJSON
      .tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SENTINEL_SOURCE })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Nothing was uploaded");
    expect((error as Error).message).not.toContain(SENTINEL_SOURCE);
  });

  it("throws the quota failure with a nothing-was-mutated note", async () => {
    mockServer.use(
      http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () =>
        HttpResponse.json({ status: false, message: "You have exceeded the maximum limit of File Storage (200 MB)" }, { status: 400 })
      )
    );

    const error = await uploadCustomWidgetCodeConfigJSON
      .tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SENTINEL_SOURCE })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("File Storage");
    expect((error as Error).message).toContain("Nothing was uploaded");
  });

  it("throws the rate-limit failure with Retry-After seconds and plan limits", async () => {
    mockServer.use(
      http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () =>
        HttpResponse.json({ status: false, message: "Too many requests (Retry-After: 17)" }, { status: 429, headers: { "Retry-After": "17" } })
      )
    );

    const error = await uploadCustomWidgetCodeConfigJSON
      .tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SENTINEL_SOURCE })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("in 17 seconds");
    expect((error as Error).message).toContain("free plan: 1");
  });

  it("explains an authorization denial in token-type terms", async () => {
    mockServer.use(
      http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () => HttpResponse.json({ status: false, message: "Authorization denied" }, { status: 400 }))
    );

    const error = await uploadCustomWidgetCodeConfigJSON
      .tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SENTINEL_SOURCE })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Profile and Analysis tokens");
  });

  it("redacts the credential and both source forms from a reflected error", async () => {
    mockServer.use(
      http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () =>
        HttpResponse.json({ status: false, message: `rejected ${REQUEST_TOKEN} with payload ${SENTINEL_SOURCE_B64} from ${SENTINEL_SOURCE}` }, { status: 400 })
      )
    );

    const error = await uploadCustomWidgetCodeConfigJSON
      .tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: SENTINEL_SOURCE })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
    expect((error as Error).message).not.toContain(SENTINEL_SOURCE);
    expect((error as Error).message).not.toContain(SENTINEL_SOURCE_B64);
  });

  it("enforces the 1 MiB cap locally with no traffic at all", async () => {
    let hits = 0;
    mockServer.use(
      http.all(`${API}/*`, () => {
        hits += 1;
        return ok({});
      })
    );

    const oversized = "x".repeat(MAX_WIDGET_SOURCE_BYTES + 1);
    const error = await uploadCustomWidgetCodeConfigJSON
      .tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, source: oversized })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("1048576 bytes");
    expect(hits).toBe(0);
  });

  it("refuses a non-iframe widget before any upload traffic", async () => {
    useWidget(fixtures.widgetInfo);
    let uploadHits = 0;
    mockServer.use(
      http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () => {
        uploadHits += 1;
        return ok(fixtures.widgetUploadResponse);
      })
    );

    const error = await uploadCustomWidgetCodeConfigJSON
      .tool(makeContext(), { dashboard_id: DASHBOARD_ID, widget_id: fixtures.IDS.widget, source: SENTINEL_SOURCE })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("iframe");
    expect(uploadHits).toBe(0);
  });
});
