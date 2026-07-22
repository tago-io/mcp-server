import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../../server/build-server";
import { TEST_REGION } from "../../testing/context";
import { fixtures } from "../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../testing/mocks/server";
import { projectAnalysis } from "../analysis/safe-projection";

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
  it("read_analysis_console redacts the credential and preserves the surrounding output", async () => {
    mockServer.use(
      http.get(`${API}/analysis`, () =>
        HttpResponse.json({ status: true, result: [{ ...fixtures.analysisInfo, console: [`leaked ${REQUEST_TOKEN} in output`, "benign console line"] }] })
      )
    );
    const { isError, text, serialized } = await callTool("read_analysis_console", { analysis_id: ANALYSIS_ID });
    expect(isError).toBe(false);
    expect(serialized).not.toContain(REQUEST_TOKEN);
    expect(text).toContain("leaked [redacted-token] in output");
    expect(text).toContain("benign console line");
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
