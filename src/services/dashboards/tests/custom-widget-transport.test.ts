import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { TEST_REGION } from "../../../testing/context";
import { fixtures } from "../../../testing/mocks/fixtures";
import { API, ok } from "../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../testing/mocks/server";
import { postWidgetSourceUpload, resolveSignedWidgetSourceUrl } from "../custom-widget-transport";

const DASHBOARD_ID = fixtures.IDS.dashboard;
const WIDGET_ID = fixtures.IDS.widget;
const PROFILE_ID = fixtures.IDS.profile;
const REQUEST_TOKEN = "p-feedfacefeedfacefeedfacefeedface1234";

const context = { token: REQUEST_TOKEN, region: TEST_REGION };

const SUCCESS_OUTCOME = {
  url: `https://files.us-e1.tago.io/${PROFILE_ID}/storage/widgets/${WIDGET_ID}.tsx`,
  artifact_hash: "abc123",
  artifact_url: `https://files.us-e1.tago.io/${PROFILE_ID}/storage/widgets/.bundled/${WIDGET_ID}/abc123.html`,
  bytes: 51234,
  success: true,
  error: null,
  warnings: ["react: no version specified, resolving to latest — pin a version"],
};

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("postWidgetSourceUpload", () => {
  it("sends exactly {file, file_name} JSON with the credential in the token header", async () => {
    const captured: Array<{ body: unknown; token: string | null; contentType: string | null; url: string }> = [];
    mockServer.use(
      http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, async ({ request }) => {
        captured.push({
          body: await request.json(),
          token: request.headers.get("token"),
          contentType: request.headers.get("content-type"),
          url: request.url,
        });
        return ok(SUCCESS_OUTCOME);
      })
    );

    const response = await postWidgetSourceUpload(context, { dashboardId: DASHBOARD_ID, widgetId: WIDGET_ID, file: "Y29kZQ==", fileName: "widget.tsx" });

    expect(captured).toHaveLength(1);
    expect(captured[0].body).toEqual({ file: "Y29kZQ==", file_name: "widget.tsx" });
    expect(captured[0].token).toBe(REQUEST_TOKEN);
    expect(captured[0].contentType).toBe("application/json");
    expect(captured[0].url).toBe(`${API}/dashboard/${DASHBOARD_ID}/widget/${WIDGET_ID}/upload`);
    expect(response).toEqual({ kind: "outcome", outcome: SUCCESS_OUTCOME });
  });

  it("returns a bundle failure as an outcome, not an error", async () => {
    const failure = {
      ...SUCCESS_OUTCOME,
      success: false,
      error: "conflicting versions for react: 18 vs 19 — one version per package",
      artifact_hash: null,
      artifact_url: null,
      warnings: [],
    };
    mockServer.use(http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () => ok(failure)));

    const response = await postWidgetSourceUpload(context, { dashboardId: DASHBOARD_ID, widgetId: WIDGET_ID, file: "Y29kZQ==", fileName: "widget.tsx" });

    expect(response).toEqual({ kind: "outcome", outcome: failure });
  });

  it("maps a thrown-error envelope to request_error with the server message and status", async () => {
    mockServer.use(
      http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () =>
        HttpResponse.json({ status: false, message: "You have exceeded the maximum limit of File Storage (200 MB)" }, { status: 400 })
      )
    );

    const response = await postWidgetSourceUpload(context, { dashboardId: DASHBOARD_ID, widgetId: WIDGET_ID, file: "Y29kZQ==", fileName: "widget.tsx" });

    expect(response).toEqual({ kind: "request_error", message: "You have exceeded the maximum limit of File Storage (200 MB)", httpStatus: 400 });
  });

  it("maps HTTP 429 to rate_limited with the Retry-After seconds", async () => {
    mockServer.use(
      http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () =>
        HttpResponse.json({ status: false, message: "Too many requests (Retry-After: 42)" }, { status: 429, headers: { "Retry-After": "42" } })
      )
    );

    const response = await postWidgetSourceUpload(context, { dashboardId: DASHBOARD_ID, widgetId: WIDGET_ID, file: "Y29kZQ==", fileName: "widget.tsx" });

    expect(response).toEqual({ kind: "rate_limited", retryAfterSeconds: 42 });
  });

  it("maps a 429 without a Retry-After header to a null retry delay", async () => {
    mockServer.use(http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () => HttpResponse.json({ status: false, message: "Too many requests" }, { status: 429 })));

    const response = await postWidgetSourceUpload(context, { dashboardId: DASHBOARD_ID, widgetId: WIDGET_ID, file: "Y29kZQ==", fileName: "widget.tsx" });

    expect(response).toEqual({ kind: "rate_limited", retryAfterSeconds: null });
  });

  it("redacts the credential and the encoded source from a reflected error envelope", async () => {
    mockServer.use(
      http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () =>
        HttpResponse.json({ status: false, message: `Bad request: ${REQUEST_TOKEN} rejected payload Y29kZQ==` }, { status: 400 })
      )
    );

    const response = await postWidgetSourceUpload(context, { dashboardId: DASHBOARD_ID, widgetId: WIDGET_ID, file: "Y29kZQ==", fileName: "widget.tsx" });

    expect(response.kind).toBe("request_error");
    const message = (response as { message: string }).message;
    expect(message).not.toContain(REQUEST_TOKEN);
    expect(message).not.toContain("Y29kZQ==");
  });

  it("rejects a malformed id before any request", async () => {
    let hits = 0;
    mockServer.use(
      http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () => {
        hits += 1;
        return ok(SUCCESS_OUTCOME);
      })
    );

    await expect(postWidgetSourceUpload(context, { dashboardId: "../../evil", widgetId: WIDGET_ID, file: "Y29kZQ==", fileName: "widget.tsx" })).rejects.toThrow(/24-character/);
    await expect(postWidgetSourceUpload(context, { dashboardId: DASHBOARD_ID, widgetId: `${WIDGET_ID}/extra`, file: "Y29kZQ==", fileName: "widget.tsx" })).rejects.toThrow(
      /24-character/
    );
    expect(hits).toBe(0);
  });

  it("fails with a redacted controlled error on a non-JSON response", async () => {
    mockServer.use(http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () => new HttpResponse("<html>gateway error</html>", { status: 502 })));

    const error = await postWidgetSourceUpload(context, { dashboardId: DASHBOARD_ID, widgetId: WIDGET_ID, file: "Y29kZQ==", fileName: "widget.tsx" }).catch(
      (caught) => caught as Error
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Widget source upload failed");
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
  });
});

describe("resolveSignedWidgetSourceUrl", () => {
  const SIGNED_URL = `https://storage-signed.example.test/users/${PROFILE_ID}/storage/widgets/${WIDGET_ID}.tsx?X-Amz-Signature=sig-sentinel`;

  it("GETs the no-storage-segment path with noRedirect=true and the token header", async () => {
    const captured: Array<{ url: string; token: string | null }> = [];
    mockServer.use(
      http.get(`${API}/file/:profileID/widgets/:fileName`, ({ request }) => {
        captured.push({ url: request.url, token: request.headers.get("token") });
        return ok(SIGNED_URL);
      })
    );

    const resolved = await resolveSignedWidgetSourceUrl(context, { profileId: PROFILE_ID, widgetId: WIDGET_ID });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(`${API}/file/${PROFILE_ID}/widgets/${WIDGET_ID}.tsx?noRedirect=true`);
    expect(captured[0].token).toBe(REQUEST_TOKEN);
    expect(resolved).toBe(SIGNED_URL);
  });

  it("throws a redacted error carrying the HTTP status on an error envelope", async () => {
    mockServer.use(http.get(`${API}/file/:profileID/widgets/:fileName`, () => HttpResponse.json({ status: false, message: `denied for ${REQUEST_TOKEN}` }, { status: 403 })));

    const error = await resolveSignedWidgetSourceUrl(context, { profileId: PROFILE_ID, widgetId: WIDGET_ID }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as { httpStatus?: number }).httpStatus).toBe(403);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
    expect((error as Error).message).toContain("[redacted-token]");
  });

  it("rejects malformed ids before any request", async () => {
    let hits = 0;
    mockServer.use(
      http.get(`${API}/file/:profileID/widgets/:fileName`, () => {
        hits += 1;
        return ok(SIGNED_URL);
      })
    );

    await expect(resolveSignedWidgetSourceUrl(context, { profileId: "not-a-profile", widgetId: WIDGET_ID })).rejects.toThrow(/24-character/);
    await expect(resolveSignedWidgetSourceUrl(context, { profileId: PROFILE_ID, widgetId: "x".repeat(24) })).rejects.toThrow(/24-character/);
    expect(hits).toBe(0);
  });
});
