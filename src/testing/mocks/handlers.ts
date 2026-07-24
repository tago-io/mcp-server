import { HttpResponse, http } from "msw";

import { docsDeviceTokenPage, docsLlmsTxt } from "./docs-fixtures";
import { fixtures } from "./fixtures";

const API = "https://api.us-e1.tago.io";
const DOCS_SITE = "https://docs.tago.io";
const SNIPPETS_SITE = "https://snippets.tago.io";

/** Wraps a payload in the TagoIO API envelope the SDK unwraps. */
function ok(result: unknown) {
  return HttpResponse.json({ status: true, result });
}

/**
 * Deterministic handlers for every TagoIO API route the tools exercise.
 * The MSW server is configured with onUnhandledRequest: "error", so any
 * SDK traffic without a handler fails the test instead of hitting the network.
 */
/**
 * GET /info introspects the supplied token: profile/analysis tokens get a
 * profile-shaped identity, unprefixed device tokens a Device-shaped one whose
 * id is the fixture device, mirroring the real API so device-token validation
 * can bind the context to the authenticated device.
 */
function tokenIntrospection(request: Request) {
  const token = request.headers.get("token") ?? "";
  const isAccountToken = token.startsWith("p-") || token.startsWith("a-");
  return ok(isAccountToken ? fixtures.networkInfoEndpoint : fixtures.deviceInfo);
}

const handlers = [
  // Startup/validation checks
  http.get(`${API}/info`, ({ request }) => tokenIntrospection(request)),
  http.get(`${API}/account`, () => ok(fixtures.accountInfo)),
  // Second allowlisted region, used by the transport region-header tests.
  http.get("https://api.eu-w1.tago.io/info", ({ request }) => tokenIntrospection(request)),

  // Devices
  http.get(`${API}/device`, () => ok([fixtures.deviceListItem])),
  http.post(`${API}/device`, () => ok({ device_id: fixtures.IDS.device, token: fixtures.FAKE_DEVICE_TOKEN })),
  http.get(`${API}/device/token/:deviceID`, () => ok([fixtures.deviceToken])),
  // The real SDK posts to /device/token with the device id in the body, and
  // the create response carries no name.
  http.post(`${API}/device/token`, () => ok(fixtures.deviceTokenCreateResponse)),
  http.delete(`${API}/device/token/:token`, () => ok("Token Successfully Removed")),
  http.get(`${API}/device/:deviceID/params`, () => ok(fixtures.deviceParams)),
  http.post(`${API}/device/:deviceID/params`, () => ok("Params Successfully Updated")),
  http.get(`${API}/device/:deviceID/data_amount`, () => ok(42)),
  http.get(`${API}/device/:deviceID/data`, () => ok([fixtures.dataRecord])),
  http.post(`${API}/device/:deviceID/data`, () => ok("1 Data Added")),
  http.put(`${API}/device/:deviceID/data`, () => ok("1 Data Updated")),
  http.delete(`${API}/device/:deviceID/data`, () => ok("1 Data Removed")),
  http.get(`${API}/device/:deviceID`, () => ok(fixtures.deviceInfo)),
  http.put(`${API}/device/:deviceID`, () => ok("Device Successfully Updated")),
  http.delete(`${API}/device/:deviceID`, () => ok("Device Successfully Removed")),

  // Device-token routes used by the SDK Device class (data operations with a device token)
  http.get(`${API}/data`, () => ok([fixtures.dataRecord])),
  http.post(`${API}/data`, () => ok("1 Data Added")),
  http.put(`${API}/data`, () => ok("1 Data Updated")),
  http.delete(`${API}/data`, () => ok("1 Data Removed")),

  // Actions
  http.get(`${API}/action`, () => ok([fixtures.actionInfo])),
  http.post(`${API}/action`, () => ok({ action: fixtures.IDS.action })),
  http.get(`${API}/action/:actionID`, () => ok(fixtures.actionInfo)),
  http.put(`${API}/action/:actionID`, () => ok("Action Successfully Updated")),
  http.delete(`${API}/action/:actionID`, () => ok("Action Successfully Removed")),

  // Analysis
  http.get(`${API}/analysis`, () => ok([fixtures.analysisInfo])),
  http.post(`${API}/analysis`, () => ok(fixtures.analysisCreateResponse)),
  http.get(`${API}/analysis/:analysisID/download`, () => ok(fixtures.analysisDownloadResponse)),
  http.post(`${API}/analysis/:analysisID/run`, () => ok({ analysis_token: fixtures.FAKE_RUN_TOKEN })),
  http.post(`${API}/analysis/:analysisID/upload`, () => ok("Analysis Script Successfully Uploaded")),
  http.get(`${API}/analysis/:analysisID`, () => ok(fixtures.analysisInfo)),
  http.put(`${API}/analysis/:analysisID`, () => ok("Successfully Updated")),
  http.delete(`${API}/analysis/:analysisID`, () => ok("Successfully Removed")),

  // Dashboards + widgets (widget create uses the SDK's trailing-slash path)
  http.get(`${API}/dashboard`, () => ok([fixtures.dashboardListItem])),
  http.post(`${API}/dashboard`, () => ok(fixtures.dashboardCreateResponse)),
  http.post(`${API}/dashboard/:dashboardID/widget/`, () => ok(fixtures.widgetCreateResponse)),
  http.get(`${API}/dashboard/:dashboardID/widget/:widgetID`, ({ params }) => ok(params.widgetID === fixtures.IDS.widgetCustom ? fixtures.widgetCustomInfo : fixtures.widgetInfo)),
  http.post(`${API}/dashboard/:dashboardID/widget/:widgetID/upload`, () => ok(fixtures.widgetUploadResponse)),
  // Custom-widget source read: signed-URL resolution + the signed storage host
  http.get(`${API}/file/:profileID/widgets/:fileName`, () => ok(fixtures.widgetSourceSignedUrl)),
  http.get(fixtures.widgetSourceSignedUrl.split("?")[0], () => HttpResponse.text(fixtures.widgetSource)),
  http.put(`${API}/dashboard/:dashboardID/widget/:widgetID`, () => ok("Successfully Updated")),
  http.delete(`${API}/dashboard/:dashboardID/widget/:widgetID`, () => ok("Successfully Removed")),
  http.get(`${API}/dashboard/:dashboardID`, () => ok(fixtures.dashboardInfo)),
  http.put(`${API}/dashboard/:dashboardID`, () => ok("Successfully Updated")),
  http.delete(`${API}/dashboard/:dashboardID`, () => ok("Successfully Removed")),

  // Signed script storage host (download_analysis_script bounded fetch)
  http.get("https://storage.tago.example/scripts/abc", () => HttpResponse.text(fixtures.analysisScript)),

  // Entities
  // List rows may omit projected keys the client requested (e.g. `index`).
  // Dropping `index` here encodes that contract so #850 cannot silently regress.
  http.get(`${API}/entity`, () => {
    const { index: _index, ...entityWithoutIndex } = fixtures.entityInfo;
    return ok([entityWithoutIndex]);
  }),
  http.post(`${API}/entity`, () => ok(fixtures.entityCreateResponse)),
  http.put(`${API}/entity/:entityID/schema`, () => ok({ message: "Entity Successfully Updated" })),
  http.get(`${API}/entity/:entityID/data`, () => ok([fixtures.entityDataRow])),
  http.post(`${API}/entity/:entityID/data`, () => ok("1 Data Added")),
  http.put(`${API}/entity/:entityID/data`, () => ok("1 item(s) updated")),
  http.delete(`${API}/entity/:entityID/data`, () => ok("1 item(s) deleted")),
  http.post(`${API}/entity/:entityID/empty`, () => ok("Data Successfully Removed")),
  http.get(`${API}/entity/:entityID`, () => ok(fixtures.entityInfo)),
  http.put(`${API}/entity/:entityID`, () => ok({ message: "Entity Successfully Updated" })),
  http.delete(`${API}/entity/:entityID`, () => ok("Entity Successfully Removed")),

  // Run users
  http.get(`${API}/run/users`, () => ok([fixtures.runUserInfo])),
  http.post(`${API}/run/users`, () => ok(fixtures.runUserCreateResponse)),
  http.get(`${API}/run/users/:userID/login`, () => ok(fixtures.runUserLoginResponse)),
  http.get(`${API}/run/users/:userID`, () => ok(fixtures.runUserInfo)),
  http.put(`${API}/run/users/:userID`, () => ok("Successfully Updated")),
  http.delete(`${API}/run/users/:userID`, () => ok("Successfully Removed")),

  // Run-user notifications
  http.get(`${API}/run/notification/:userID`, () => ok([fixtures.runUserNotification])),
  http.post(`${API}/run/notification/`, () => ok({ id: fixtures.IDS.notification })),
  http.put(`${API}/run/notification/:notificationID`, () => ok("Successfully Updated")),
  http.delete(`${API}/run/notification/:notificationID`, () => ok("Successfully Removed")),

  // Profile + secrets
  http.get(`${API}/profile/current`, () => ok(fixtures.profileInfo)),
  http.get(`${API}/profile/:profileID/summary`, () => ok(fixtures.profileSummary)),
  http.get(`${API}/profile/:profileID/statistics`, () => ok(fixtures.profileStatistics)),
  http.get(`${API}/profile/:profileID`, () => ok(fixtures.profileInfo)),
  http.get(`${API}/secrets`, () => ok([fixtures.secretInfo])),

  // Integration (connectors trailing-slash quirk is real SDK behavior).
  // The real list route treats `filter.public` as a PRESENCE check only: when
  // the key is present with any value, marketplace-public rows are omitted;
  // when the key is absent, they are included. Value is never read.
  http.get(`${API}/integration/connector/`, ({ request }) => {
    const url = new URL(request.url);
    const excludePublic = url.searchParams.has("filter[public]");
    const connectors = excludePublic ? [fixtures.connectorPrivateInfo] : [fixtures.connectorInfo, fixtures.connectorPrivateInfo];
    return ok(connectors);
  }),
  http.get(`${API}/integration/connector/:connectorID`, () => ok(fixtures.connectorInfo)),
  http.get(`${API}/integration/network/`, ({ request }) => {
    const url = new URL(request.url);
    const excludePublic = url.searchParams.has("filter[public]");
    const networks = excludePublic ? [fixtures.networkPrivateInfo] : [fixtures.networkInfo, fixtures.networkPrivateInfo];
    return ok(networks);
  }),
  http.get(`${API}/integration/network/:networkID`, () => ok(fixtures.networkInfo)),

  // snippets.tago.io (search_code_examples indexes + get_code_example sources)
  http.get(`${SNIPPETS_SITE}/analysis/node-rt2025.json`, () => HttpResponse.json(fixtures.snippetsAnalysisIndex)),
  http.get(`${SNIPPETS_SITE}/analysis/node-legacy.json`, () => HttpResponse.json(fixtures.snippetsAnalysisLegacyIndex)),
  http.get(`${SNIPPETS_SITE}/analysis/python-legacy.json`, () => HttpResponse.json(fixtures.snippetsAnalysisPythonLegacyIndex)),
  http.get(`${SNIPPETS_SITE}/analysis/python-rt2025.json`, () => HttpResponse.json(fixtures.snippetsAnalysisPythonIndex)),
  http.get(`${SNIPPETS_SITE}/analysis/deno-rt2025.json`, () => HttpResponse.json(fixtures.snippetsAnalysisDenoIndex)),
  http.get(`${SNIPPETS_SITE}/payload-parser/javascript.json`, () => HttpResponse.json(fixtures.snippetsParserIndex)),
  http.get(`${SNIPPETS_SITE}/analysis/node-rt2025/console.js`, () => HttpResponse.text(fixtures.snippetSourceConsole, { headers: { "content-type": "application/javascript" } })),
  http.get(`${SNIPPETS_SITE}/payload-parser/javascript/base64-decoder.js`, () =>
    HttpResponse.text(fixtures.snippetSourceParser, { headers: { "content-type": "application/javascript" } })
  ),

  // docs.tago.io (docs tools: search_docs index + read_doc pages)
  http.get(`${DOCS_SITE}/llms.txt`, () => HttpResponse.text(docsLlmsTxt)),
  http.get(`${DOCS_SITE}/docs/tagoio/devices/device-token.md`, () => HttpResponse.text(docsDeviceTokenPage, { headers: { "content-type": "text/markdown" } })),
];

export { API, DOCS_SITE, SNIPPETS_SITE, handlers, ok };
