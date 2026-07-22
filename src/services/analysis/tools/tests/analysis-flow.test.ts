import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { API, ok } from "../../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { createAnalysisConfigJSON } from "../create-analysis";
import { deleteAnalysisConfigJSON } from "../delete-analysis";
import { downloadAnalysisScriptConfigJSON } from "../download-analysis-script";
import { getAnalysisConfigJSON } from "../get-analysis";
import { readAnalysisConsoleConfigJSON } from "../read-analysis-console";
import { runAnalysisConfigJSON } from "../run-analysis";
import { updateAnalysisConfigJSON } from "../update-analysis";
import { uploadAnalysisScriptConfigJSON } from "../upload-analysis-script";

const ANALYSIS_ID = fixtures.IDS.analysis;
const REQUEST_TOKEN = "a-0000000000000000000000000000000000";
const FLOW_SCRIPT = 'console.log("flow script v1");\n';

interface FakeAnalysis {
  created: boolean;
  deleted: boolean;
  name: string;
  active: boolean;
  scriptBase64?: string;
  console: string[];
}

function makeContext() {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  return makeTestContext({ resources, token: REQUEST_TOKEN });
}

function useStatefulAnalysis(record: FakeAnalysis) {
  const infoPayload = () => ({
    ...fixtures.analysisInfo,
    id: ANALYSIS_ID,
    name: record.name,
    active: record.active,
  });

  mockServer.use(
    http.post(`${API}/analysis`, async ({ request }) => {
      const body = (await request.json()) as { name: string };
      record.created = true;
      record.name = body.name;
      return ok({ id: ANALYSIS_ID, token: fixtures.FAKE_ANALYSIS_TOKEN });
    }),
    http.get(`${API}/analysis`, () => (record.deleted ? ok([]) : ok([{ id: ANALYSIS_ID, name: record.name, console: record.console }]))),
    http.get(`${API}/analysis/:analysisID/download`, () =>
      record.deleted ? HttpResponse.json({ status: false, message: "Analysis Not Found" }, { status: 404 }) : ok(fixtures.analysisDownloadResponse)
    ),
    http.post(`${API}/analysis/:analysisID/run`, () => ok({ analysis_token: fixtures.FAKE_RUN_TOKEN })),
    http.post(`${API}/analysis/:analysisID/upload`, async ({ request }) => {
      const body = (await request.json()) as { file: string };
      record.scriptBase64 = body.file;
      return ok("Analysis Script Successfully Uploaded");
    }),
    http.get(`${API}/analysis/:analysisID`, () => (record.deleted ? HttpResponse.json({ status: false, message: "Analysis Not Found" }, { status: 404 }) : ok(infoPayload()))),
    http.put(`${API}/analysis/:analysisID`, async ({ request }) => {
      const body = (await request.json()) as { active?: boolean };
      if (body.active !== undefined) {
        record.active = body.active;
      }
      return ok("Successfully Updated");
    }),
    http.delete(`${API}/analysis/:analysisID`, () => {
      record.deleted = true;
      return ok("Successfully Removed");
    }),
    http.get("https://storage.tago.example/scripts/abc", () =>
      record.scriptBase64 ? HttpResponse.text(Buffer.from(record.scriptBase64, "base64").toString("utf8")) : new HttpResponse(null, { status: 404 })
    )
  );
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("analysis authoring flow", () => {
  it("drives create → upload → run → console → update → download → delete with failure injections and no secret leaks", async () => {
    const record: FakeAnalysis = { created: false, deleted: false, name: "", active: true, console: [] };
    useStatefulAnalysis(record);
    const context = makeContext();
    // Every tool output and error message across the flow, checked at the end
    // against all sentinel secrets.
    const transcript: string[] = [];

    async function call(config: { tool: (ctx: typeof context, params: never) => Promise<string> }, params: Record<string, unknown>): Promise<string> {
      const output = await config.tool(context, params as never);
      transcript.push(output);
      return output;
    }

    // The SDK throws plain strings for some API failures, so the caught value
    // is normalized to its message.
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

    const created = await call(createAnalysisConfigJSON, { name: "Flow Analysis" });
    expect(created).toContain(ANALYSIS_ID);
    expect(record.created).toBe(true);

    // Upload failure injection: a client-error response yields a controlled
    // error and the flow retries. (5xx is unusable here: the SDK transparently
    // retries server errors with multi-second exponential backoff.)
    mockServer.use(http.post(`${API}/analysis/:analysisID/upload`, () => HttpResponse.json({ status: false, message: "Upload rejected" }, { status: 400 }), { once: true }));
    await callExpectingError(uploadAnalysisScriptConfigJSON, { analysis_id: ANALYSIS_ID, filename: "main.js", source: FLOW_SCRIPT });
    expect(record.scriptBase64).toBeUndefined();

    const uploaded = await call(uploadAnalysisScriptConfigJSON, { analysis_id: ANALYSIS_ID, filename: "main.js", source: FLOW_SCRIPT });
    expect(uploaded).toContain("main.js");
    expect(Buffer.from(record.scriptBase64 as string, "base64").toString("utf8")).toBe(FLOW_SCRIPT);

    const ran = await call(runAnalysisConfigJSON, { analysis_id: ANALYSIS_ID, scope: { reason: "flow-test" } });
    expect(ran).toContain("triggered");
    expect(ran).not.toContain("completed");

    const emptyConsole = await call(readAnalysisConsoleConfigJSON, { analysis_id: ANALYSIS_ID });
    expect(emptyConsole).toMatch(/take time to appear/);

    record.console.push("flow run started", "flow run output line");
    const visibleConsole = await call(readAnalysisConsoleConfigJSON, { analysis_id: ANALYSIS_ID });
    expect(visibleConsole).toContain("flow run started");
    expect(visibleConsole).toContain("flow run output line");

    await call(updateAnalysisConfigJSON, { analysis_id: ANALYSIS_ID, active: false });
    expect(record.active).toBe(false);

    const downloaded = await call(downloadAnalysisScriptConfigJSON, { analysis_id: ANALYSIS_ID });
    expect(downloaded).toContain(FLOW_SCRIPT.trim());

    mockServer.use(
      http.delete(`${API}/analysis/:analysisID`, () => HttpResponse.json({ status: false, message: `Could not remove analysis ${ANALYSIS_ID}` }, { status: 400 }), {
        once: true,
      })
    );
    const deleteError = await callExpectingError(deleteAnalysisConfigJSON, { analysis_id: ANALYSIS_ID });
    expect(deleteError).toContain(ANALYSIS_ID);
    expect(record.deleted).toBe(false);

    await call(deleteAnalysisConfigJSON, { analysis_id: ANALYSIS_ID });
    expect(record.deleted).toBe(true);

    await callExpectingError(getAnalysisConfigJSON, { analysis_id: ANALYSIS_ID });

    expect(transcript.length).toBeGreaterThan(0);
    for (const output of transcript) {
      expect(output).not.toContain(fixtures.FAKE_ANALYSIS_TOKEN);
      expect(output).not.toContain(fixtures.FAKE_RUN_TOKEN);
      expect(output).not.toContain("fake-signature-sentinel");
      expect(output).not.toContain(REQUEST_TOKEN);
    }
  });
});
