import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../../server/build-server";
import { TEST_REGION } from "../../testing/context";
import { fixtures } from "../../testing/mocks/fixtures";
import { ok } from "../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../testing/mocks/server";
import { projectAnalysis, projectAnalysisConsole } from "../analysis/safe-projection";

/**
 * Secret/error/output boundary tests. Every case goes through a real
 * in-memory MCP client/server pair so the composition-root boundary in
 * buildServer is exercised, not just the individual handlers. Sentinels are
 * obviously fake; the assertions check the full serialized result so nothing
 * reaches results, protocol errors, or downstream snapshots.
 */

const API = "https://api.us-e1.tago.io";
const REQUEST_TOKEN = "a-99999999-request-credential-sentinel";
const ANALYSIS_ID = fixtures.IDS.analysis;
const DASHBOARD_ID = fixtures.IDS.dashboard;
const WIDGET_ID = fixtures.IDS.widget;
const WIDGET_UNPLACED_ID = fixtures.IDS.widgetUnplaced;
const FILE_PATH = `widgets/${fixtures.IDS.widgetCustom}.tsx`;
const ACCESS_POLICY_ID = fixtures.accessPolicies[0].id;
const ACCESS_POLICY_BODY = {
  name: "Boundary Policy",
  targets: [{ by: "id", id: ANALYSIS_ID }],
  permissions: [{ effect: "allow", resource: "device", actions: ["send_data"] }],
};

const RUN_USER_POLICY_ID = fixtures.accessPolicies[1].id;
const RUN_USER_POLICY_BODY = {
  name: "Boundary Run Policy",
  targets: [{ by: "any" }],
  permissions: [{ effect: "allow", resource: "dashboard", actions: ["access"] }],
};

const ENV_STRING_SENTINEL = "sentinel-env-string-do-not-echo";
const ENV_NUMBER_SENTINEL = 4242424242;
const ENV_BOOLEAN_SENTINEL = true;
const SOURCE_SENTINEL = "const secret = 'sentinel-source-body-do-not-echo';";
const SOURCE_SENTINEL_BASE64 = Buffer.from(SOURCE_SENTINEL, "utf8").toString("base64");

function reflect(message: string) {
  return HttpResponse.json({ status: false, message }, { status: 400 });
}

async function connect() {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  const server = buildServer({ resources, token: REQUEST_TOKEN, region: TEST_REGION, credentialKind: "analysis" });
  const client = new Client({ name: "secret-boundary-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

async function callTool(name: string, args: Record<string, unknown>) {
  const { client, server } = await connect();
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ text: string }>).map((entry) => entry.text).join("\n");
    return { isError: result.isError === true, text, serialized: JSON.stringify(result) };
  } finally {
    await client.close();
    await server.close();
  }
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

interface ReflectionCase {
  tool: string;
  args: Record<string, unknown>;
  override: () => void;
}

// Every analysis/dashboard mutation (plus the read paths that touch external
// content): the API reflects the request credential in its failure message
// and the tool result must not carry it.
const reflectionCases: ReflectionCase[] = [
  { tool: "create_analysis", args: { name: "X" }, override: () => mockServer.use(http.post(`${API}/analysis`, () => reflect(`bad request by ${REQUEST_TOKEN}`))) },
  {
    tool: "update_analysis",
    args: { analysis_id: ANALYSIS_ID, name: "X" },
    override: () => mockServer.use(http.put(`${API}/analysis/:id`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    tool: "delete_analysis",
    args: { analysis_id: ANALYSIS_ID },
    override: () => mockServer.use(http.delete(`${API}/analysis/:id`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    tool: "upload_analysis_script",
    args: { analysis_id: ANALYSIS_ID, filename: "main.js", source: "console.log(1)" },
    override: () => mockServer.use(http.post(`${API}/analysis/:id/upload`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    tool: "run_analysis",
    args: { analysis_id: ANALYSIS_ID },
    override: () => mockServer.use(http.post(`${API}/analysis/:id/run`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    tool: "download_analysis_script",
    args: { analysis_id: ANALYSIS_ID },
    override: () => mockServer.use(http.get(`${API}/analysis/:id/download`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  { tool: "create_dashboard", args: { label: "X" }, override: () => mockServer.use(http.post(`${API}/dashboard`, () => reflect(`bad request by ${REQUEST_TOKEN}`))) },
  {
    tool: "create_dashboard",
    args: { label: "X" },
    override: () => mockServer.use(http.get(`${API}/profile/current`, () => reflect(`profile lookup failed for ${REQUEST_TOKEN}`))),
  },
  {
    tool: "update_dashboard",
    args: { dashboard_id: DASHBOARD_ID, label: "X" },
    override: () => mockServer.use(http.put(`${API}/dashboard/:id`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    tool: "delete_dashboard",
    args: { dashboard_id: DASHBOARD_ID },
    override: () => mockServer.use(http.delete(`${API}/dashboard/:id`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    tool: "create_widget",
    args: { dashboard_id: DASHBOARD_ID, configuration: { label: "G", type: "gauge", display: { gauge_type: "solid", numberformat: "0", minimum: 0, maximum: 100 } } },
    override: () => mockServer.use(http.post(`${API}/dashboard/:id/widget/`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    tool: "update_widget",
    args: { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { label: "X" } },
    override: () => mockServer.use(http.put(`${API}/dashboard/:id/widget/:wid`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    tool: "delete_widget",
    args: { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_UNPLACED_ID },
    override: () => mockServer.use(http.delete(`${API}/dashboard/:id/widget/:wid`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  { tool: "search_files", args: {}, override: () => mockServer.use(http.get(`${API}/files`, () => reflect(`bad request by ${REQUEST_TOKEN}`))) },
  {
    tool: "delete_files",
    args: { paths: [FILE_PATH] },
    override: () => mockServer.use(http.delete(`${API}/files`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    // The verification listing runs before the delete, so its failure is the
    // other credential-reflecting path into delete_files.
    tool: "delete_files",
    args: { paths: [FILE_PATH] },
    override: () => mockServer.use(http.get(`${API}/files`, () => reflect(`listing rejected for ${REQUEST_TOKEN}`))),
  },
  { tool: "search_access_policies", args: {}, override: () => mockServer.use(http.get(`${API}/am`, () => reflect(`bad request by ${REQUEST_TOKEN}`))) },
  {
    tool: "get_access_policy",
    args: { access_policy_id: ACCESS_POLICY_ID },
    override: () => mockServer.use(http.get(`${API}/am/:amID`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    // The catalog fetch is this domain's only non-SDK request, so it is a
    // credential path of its own.
    tool: "lookup_access_permissions",
    args: { target_type: "analysis" },
    override: () => mockServer.use(http.get(`${API}/am/settings`, () => reflect(`catalog rejected for ${REQUEST_TOKEN}`))),
  },
  {
    tool: "create_analysis_access_policy",
    args: ACCESS_POLICY_BODY,
    override: () => mockServer.use(http.post(`${API}/am`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    // The two create variants share a factory but are registered separately, so
    // each is its own path out of the server.
    tool: "create_run_user_access_policy",
    args: RUN_USER_POLICY_BODY,
    override: () => mockServer.use(http.post(`${API}/am`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    tool: "update_analysis_access_policy",
    args: { access_policy_id: ACCESS_POLICY_ID, name: "X" },
    override: () => mockServer.use(http.put(`${API}/am/:amID`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    tool: "update_run_user_access_policy",
    args: { access_policy_id: RUN_USER_POLICY_ID, name: "X" },
    override: () => mockServer.use(http.put(`${API}/am/:amID`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
  {
    // The pre-read that establishes the policy's target kind runs on every
    // update path, so it is a credential-reflecting path of its own.
    tool: "update_analysis_access_policy",
    args: { access_policy_id: ACCESS_POLICY_ID, permissions: ACCESS_POLICY_BODY.permissions },
    override: () => mockServer.use(http.get(`${API}/am/:amID`, () => reflect(`policy read rejected for ${REQUEST_TOKEN}`))),
  },
  {
    tool: "delete_access_policy",
    args: { access_policy_id: ACCESS_POLICY_ID },
    override: () => mockServer.use(http.delete(`${API}/am/:amID`, () => reflect(`bad request by ${REQUEST_TOKEN}`))),
  },
];

describe("request credential never escapes through reflected SDK failures", () => {
  it.each(reflectionCases.map((entry) => [entry.tool, entry] as const))("%s", async (_name, entry) => {
    entry.override();
    const { isError, serialized } = await callTool(entry.tool, entry.args);
    expect(isError).toBe(true);
    expect(serialized).not.toContain(REQUEST_TOKEN);
    expect(serialized).toContain("[redacted-token]");
  });
});

describe("analysis environment values never escape through reflected failures", () => {
  const variables = [
    { key: "STRING_VAR", value: ENV_STRING_SENTINEL },
    { key: "NUMBER_VAR", value: ENV_NUMBER_SENTINEL },
    { key: "BOOLEAN_VAR", value: ENV_BOOLEAN_SENTINEL },
  ];

  it("create_analysis failure reflecting the submitted body carries no environment value", async () => {
    mockServer.use(http.post(`${API}/analysis`, async ({ request }) => reflect(`rejected payload: ${JSON.stringify(await request.json())}`)));
    const { isError, serialized } = await callTool("create_analysis", { name: "Env", environment_variables: variables });
    expect(isError).toBe(true);
    expect(serialized).not.toContain(ENV_STRING_SENTINEL);
    expect(serialized).not.toContain(String(ENV_NUMBER_SENTINEL));
    expect(serialized).not.toContain('"BOOLEAN_VAR","value":true');
  });

  it("update_analysis failure reflecting the submitted body carries no environment value", async () => {
    mockServer.use(http.put(`${API}/analysis/:id`, async ({ request }) => reflect(`rejected payload: ${JSON.stringify(await request.json())}`)));
    const { isError, serialized } = await callTool("update_analysis", { analysis_id: ANALYSIS_ID, environment_variables: variables });
    expect(isError).toBe(true);
    expect(serialized).not.toContain(ENV_STRING_SENTINEL);
    expect(serialized).not.toContain(String(ENV_NUMBER_SENTINEL));
    expect(serialized).not.toContain('"BOOLEAN_VAR","value":true');
  });
});

describe("uploaded source never escapes through reflected failures", () => {
  it("upload failure reflecting plaintext and base64 source carries neither form", async () => {
    mockServer.use(
      http.post(`${API}/analysis/:id/upload`, async ({ request }) => {
        // SDK wire body: { file: <base64>, file_name, language }.
        const body = (await request.json()) as { file: string };
        const plain = Buffer.from(body.file, "base64").toString("utf8");
        return reflect(`rejected script: ${body.file} decoded as ${plain}`);
      })
    );
    const { isError, serialized } = await callTool("upload_analysis_script", { analysis_id: ANALYSIS_ID, filename: "main.js", source: SOURCE_SENTINEL });
    expect(isError).toBe(true);
    expect(serialized).not.toContain(SOURCE_SENTINEL);
    expect(serialized).not.toContain(SOURCE_SENTINEL_BASE64);
    expect(serialized).toContain("[redacted-token]");
  });
});

describe("request credential embedded in explicit user-content bodies", () => {
  it("read_analysis_console exposes only console entries from the full analysis info response", async () => {
    const { isError, text, serialized } = await callTool("read_analysis_console", { analysis_id: ANALYSIS_ID });
    expect(isError).toBe(false);
    expect(text).toContain("sentinel console line");
    expect(serialized).not.toContain(fixtures.FAKE_ANALYSIS_TOKEN);
    expect(serialized).not.toContain("sentinel-env-value-do-not-print");

    const consoleProjection = projectAnalysisConsole(fixtures.analysisInfo);
    expect(consoleProjection).toEqual(["sentinel console line"]);
    expect(JSON.stringify(consoleProjection)).not.toContain(fixtures.FAKE_ANALYSIS_TOKEN);
    expect(JSON.stringify(consoleProjection)).not.toContain("sentinel-env-value-do-not-print");
    expect(projectAnalysis(fixtures.analysisInfo)).not.toHaveProperty("console");
  });

  it("read_analysis_console redacts the credential and preserves the surrounding output", async () => {
    mockServer.use(
      http.get(`${API}/analysis/:analysisID`, () =>
        HttpResponse.json({ status: true, result: { ...fixtures.analysisInfo, console: [`leaked ${REQUEST_TOKEN} in output`, "benign console line"] } })
      )
    );
    const { isError, text, serialized } = await callTool("read_analysis_console", { analysis_id: ANALYSIS_ID });
    expect(isError).toBe(false);
    expect(serialized).not.toContain(REQUEST_TOKEN);
    expect(text).toContain("leaked [redacted-token] in output");
    expect(text).toContain("benign console line");
  });

  it("read_analysis_console scrubs the analysis's own token and long env-var values embedded in console entries", async () => {
    const OWN_TOKEN = fixtures.FAKE_ANALYSIS_TOKEN;
    const OWN_ENV_VALUE = "sentinel-env-value-do-not-print";
    const OTHER_RUN_TOKEN = "a-11111111-run-token-printed-by-script";
    mockServer.use(
      http.get(`${API}/analysis/:analysisID`, () =>
        HttpResponse.json({
          status: true,
          result: {
            ...fixtures.analysisInfo,
            console: [`dumped T_ANALYSIS_TOKEN=${OWN_TOKEN}`, `env SENTINEL_KEY=${OWN_ENV_VALUE}`, `spawned run token ${OTHER_RUN_TOKEN}`, "benign console line survives"],
          },
        })
      )
    );
    const { isError, text, serialized } = await callTool("read_analysis_console", { analysis_id: ANALYSIS_ID });
    expect(isError).toBe(false);
    expect(serialized).not.toContain(OWN_TOKEN);
    expect(serialized).not.toContain(OWN_ENV_VALUE);
    expect(serialized).not.toContain(OTHER_RUN_TOKEN);
    expect(text).toContain("benign console line survives");
    expect(text).toContain("[redacted-token]");
  });

  it("projectAnalysisConsole scrubs the analysis's own token and long env values while keeping short values and benign text", () => {
    const projection = projectAnalysisConsole({
      token: fixtures.FAKE_ANALYSIS_TOKEN,
      variables: [
        { key: "SENTINEL_KEY", value: "sentinel-env-value-do-not-print" },
        { key: "STAGE", value: "prod" },
      ],
      console: [`own token ${fixtures.FAKE_ANALYSIS_TOKEN}`, "env sentinel-env-value-do-not-print here", "stage is prod and fine"],
    });
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain(fixtures.FAKE_ANALYSIS_TOKEN);
    expect(serialized).not.toContain("sentinel-env-value-do-not-print");
    // Short env values are intentionally not literal-redacted, so benign console text stays intact.
    expect(projection[2]).toBe("stage is prod and fine");
  });

  it("projectAnalysisConsole redacts a numeric env value whose string form is long enough, keeping short numerics", () => {
    const NUMERIC_ENV = 4242424242; // String form "4242424242" is 10 chars, at/over the threshold.
    const projection = projectAnalysisConsole({
      variables: [
        { key: "ACCOUNT", value: NUMERIC_ENV },
        { key: "PORT", value: 8080 },
      ],
      console: [`numeric env ACCOUNT=${NUMERIC_ENV}`, "listening on 8080"],
    });
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain(String(NUMERIC_ENV));
    // Short numeric values fall under the same threshold and stay intact.
    expect(projection[1]).toBe("listening on 8080");
  });

  it("projectAnalysisConsole redacts a token-shaped value even when a word char precedes it", () => {
    const SPACE_PRECEDED = "a-abcdef01-2345-6789-abcd-ef0123456789";
    const WORD_ADJACENT = `token_${SPACE_PRECEDED}`;
    const projection = projectAnalysisConsole({
      console: [`space ${SPACE_PRECEDED} here`, `adjacent ${WORD_ADJACENT} here`],
    });
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain(SPACE_PRECEDED);
    // Only the a- token is redacted; the "token_" prefix survives.
    expect(projection[1]).toContain("token_[redacted-token]");
  });

  it("download_analysis_script redacts the credential and preserves the surrounding source", async () => {
    mockServer.use(http.get("https://storage.tago.example/scripts/abc", () => HttpResponse.text(`// key: ${REQUEST_TOKEN}\nconsole.log("benign source line");\n`)));
    const { isError, text, serialized } = await callTool("download_analysis_script", { analysis_id: ANALYSIS_ID });
    expect(isError).toBe(false);
    expect(serialized).not.toContain(REQUEST_TOKEN);
    expect(text).toContain("// key: [redacted-token]");
    expect(text).toContain('console.log("benign source line");');
  });
});

describe("dashboard/widget capability fields never render", () => {
  it("detailed get_widget strips token/analysis_token at any depth and keeps the configuration", async () => {
    mockServer.use(
      http.get(`${API}/dashboard/:id/widget/:wid`, () =>
        HttpResponse.json({
          status: true,
          result: {
            ...fixtures.widgetInfo,
            token: "widget-capability-token-sentinel",
            analysis_run: "61f00000000000000000b001",
            data: [{ origin: "device", qty: 10, token: "nested-data-token-sentinel", nested: { analysis_token: "nested-analysis-token-sentinel" } }],
          },
        })
      )
    );
    const { isError, serialized, text } = await callTool("get_widget", { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, response_format: "detailed" });
    expect(isError).toBe(false);
    expect(serialized).not.toContain("widget-capability-token-sentinel");
    expect(serialized).not.toContain("nested-data-token-sentinel");
    expect(serialized).not.toContain("nested-analysis-token-sentinel");
    // Legitimate configuration needed for cloning/updating survives.
    expect(text).toContain("gauge");
    expect(text).toContain("Tank pressure");
    expect(text).toContain("origin");
  });

  it("detailed get_dashboard strips nested token fields", async () => {
    mockServer.use(
      http.get(`${API}/dashboard/:id`, () => HttpResponse.json({ status: true, result: { ...fixtures.dashboardInfo, shared: { token: "dashboard-share-token-sentinel" } } }))
    );
    const { isError, serialized, text } = await callTool("get_dashboard", { dashboard_id: DASHBOARD_ID, response_format: "detailed" });
    expect(isError).toBe(false);
    expect(serialized).not.toContain("dashboard-share-token-sentinel");
    expect(text).toContain("Fleet Overview");
  });

  it("detailed search_dashboards strips nested token fields", async () => {
    mockServer.use(http.get(`${API}/dashboard`, () => HttpResponse.json({ status: true, result: [{ ...fixtures.dashboardListItem, token: "dashboard-list-token-sentinel" }] })));
    const { isError, serialized } = await callTool("search_dashboards", { response_format: "detailed" });
    expect(isError).toBe(false);
    expect(serialized).not.toContain("dashboard-list-token-sentinel");
  });
});

const PROFILE_TOKEN = "p-88888888-profile-credential-sentinel";
const DEVICE_ID = fixtures.IDS.device;
const REUSED_DEVICE_TOKEN = fixtures.FAKE_DEVICE_TOKEN;
const MINTED_DEVICE_TOKEN = fixtures.deviceTokenCreateResponse.token;

/** Profile-credential twin of callTool: send_device_data forks to the device-token path only for profile tokens. */
async function callProfileTool(name: string, args: Record<string, unknown>) {
  const resources = new Resources({ token: PROFILE_TOKEN, region: TEST_REGION });
  const server = buildServer({ resources, token: PROFILE_TOKEN, region: TEST_REGION, credentialKind: "profile" });
  const client = new Client({ name: "secret-boundary-profile-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ text: string }>).map((entry) => entry.text).join("\n");
    return { isError: result.isError === true, text, serialized: JSON.stringify(result) };
  } finally {
    await client.close();
    await server.close();
  }
}

describe("profile send_device_data never leaks the reused or minted device token", () => {
  const SEND_DATA = [{ variable: "temperature", value: 25.5 }];

  it("does not surface the reused device token on a successful send", async () => {
    const { isError, serialized } = await callProfileTool("send_device_data", { device_id: DEVICE_ID, data: SEND_DATA });
    expect(isError).toBe(false);
    expect(serialized).not.toContain(REUSED_DEVICE_TOKEN);
  });

  it("redacts the reused device token when a SUCCESS ingest body echoes it", async () => {
    mockServer.use(http.post(`${API}/data`, () => ok(`1 Data Added for token ${REUSED_DEVICE_TOKEN}`)));
    const { isError, serialized } = await callProfileTool("send_device_data", { device_id: DEVICE_ID, data: SEND_DATA });
    expect(isError).toBe(false);
    expect(serialized).not.toContain(REUSED_DEVICE_TOKEN);
    expect(serialized).toContain("[redacted-token]");
  });

  it("redacts the reused device token when the ingest failure reflects it", async () => {
    mockServer.use(http.post(`${API}/data`, () => reflect(`ingest rejected for token ${REUSED_DEVICE_TOKEN}`)));
    const { isError, serialized } = await callProfileTool("send_device_data", { device_id: DEVICE_ID, data: SEND_DATA });
    expect(isError).toBe(true);
    expect(serialized).not.toContain(REUSED_DEVICE_TOKEN);
    expect(serialized).toContain("[redacted-token]");
  });

  it("redacts the minted device token when no usable token exists and the failure reflects it", async () => {
    mockServer.use(
      http.get(`${API}/device/token/:deviceID`, () => HttpResponse.json({ status: true, result: [] })),
      http.post(`${API}/data`, () => reflect(`ingest rejected for token ${MINTED_DEVICE_TOKEN}`))
    );
    const { isError, serialized } = await callProfileTool("send_device_data", { device_id: DEVICE_ID, data: SEND_DATA });
    expect(isError).toBe(true);
    expect(serialized).not.toContain(MINTED_DEVICE_TOKEN);
    expect(serialized).toContain("[redacted-token]");
  });
});

describe("search_files never surfaces a signed URL", () => {
  const SIGNED_URL_SENTINEL = fixtures.widgetSourceSignedUrl;

  it("does not resolve a signed URL for any listed file", async () => {
    const requests: string[] = [];
    mockServer.events.on("request:start", ({ request }) => {
      requests.push(`${request.method} ${new URL(request.url).pathname}`);
    });

    const { isError, serialized } = await callTool("search_files", { path: "widgets/" });

    expect(isError).toBe(false);
    // The one signed-URL route in the Files surface (getFileURLSigned) is
    // never called, so the credential it returns cannot reach the output.
    expect(requests).toEqual(["GET /files"]);
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain(SIGNED_URL_SENTINEL);
    mockServer.events.removeAllListeners();
  });

  it("does not render a signed URL the API smuggles into a listing entry", async () => {
    mockServer.use(
      http.get(`${API}/files`, () =>
        ok({
          total: 200,
          usage: 1,
          folders: [],
          files: [{ filename: "widgets/leaked.tsx", size: 1, last_modified: "2026-01-01T00:00:00.000Z", url: SIGNED_URL_SENTINEL }],
        })
      )
    );

    const { isError, serialized } = await callTool("search_files", { path: "widgets/" });

    expect(isError).toBe(false);
    expect(serialized).toContain("widgets/leaked.tsx");
    expect(serialized).not.toContain(SIGNED_URL_SENTINEL);
  });

  it("does not render a smuggled signed URL in detailed mode either", async () => {
    mockServer.use(
      http.get(`${API}/files`, () =>
        ok({
          total: 200,
          usage: 1,
          folders: [],
          files: [{ filename: "widgets/leaked.tsx", size: 1, last_modified: "2026-01-01T00:00:00.000Z", url: SIGNED_URL_SENTINEL }],
        })
      )
    );

    const { isError, serialized } = await callTool("search_files", { path: "widgets/", response_format: "detailed" });

    expect(isError).toBe(false);
    expect(serialized).not.toContain(SIGNED_URL_SENTINEL);
  });
});

describe("safe analysis projection strips token properties recursively", () => {
  it("removes token/analysis_token nested inside allowed fields", () => {
    const projected = projectAnalysis({
      id: "x",
      name: "n",
      versions: { "1": { file_name: "a.js", token: "nested-token-sentinel" }, "2": { analysis_token: "nested-analysis-token-sentinel" } },
      tags: [{ key: "k", value: "v", token: "tag-token-sentinel" }],
    });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("nested-token-sentinel");
    expect(serialized).not.toContain("nested-analysis-token-sentinel");
    expect(serialized).not.toContain("tag-token-sentinel");
    expect(serialized).toContain("a.js");
    expect(serialized).toContain('"key":"k"');
  });
});
