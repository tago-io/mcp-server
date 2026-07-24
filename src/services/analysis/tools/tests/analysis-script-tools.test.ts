import { gzipSync } from "node:zlib";
import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { API, ok } from "../../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { downloadAnalysisScriptConfigJSON } from "../download-analysis-script";
import { readAnalysisConsoleConfigJSON } from "../read-analysis-console";
import { runAnalysisConfigJSON } from "../run-analysis";
import { MAX_SCRIPT_SOURCE_BYTES, uploadAnalysisScriptConfigJSON } from "../upload-analysis-script";

const ANALYSIS_ID = fixtures.IDS.analysis;
const REQUEST_TOKEN = "a-0000000000000000000000000000000000";
const STORAGE_PATH = "https://storage.tago.example/scripts/abc";

function makeContext() {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  return makeTestContext({ resources, token: REQUEST_TOKEN });
}

function captureBodies(path: string, response: unknown) {
  const bodies: Array<Record<string, unknown>> = [];
  mockServer.use(
    http.post(path, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return ok(response);
    })
  );
  return bodies;
}

function useAnalysisInfo(overrides: Record<string, unknown>) {
  mockServer.use(http.get(`${API}/analysis/:analysisID`, () => ok({ ...fixtures.analysisInfo, ...overrides })));
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("upload_analysis_script", () => {
  it("sends the exact wire body: base64 source, filename, language from the analysis runtime", async () => {
    const bodies = captureBodies(`${API}/analysis/:analysisID/upload`, "Analysis Script Successfully Uploaded");
    const source = "console.log('hello upload');\n";

    const result = await uploadAnalysisScriptConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID, filename: "main.js", source });

    expect(bodies).toHaveLength(1);
    expect(bodies[0].file_name).toBe("main.js");
    expect(bodies[0].language).toBe(fixtures.analysisInfo.runtime);
    expect(Buffer.from(bodies[0].file as string, "base64").toString("utf8")).toBe(source);
    expect(result).toContain("main.js");
    expect(result).toContain(ANALYSIS_ID);
    expect(result).toContain("run_analysis");
  });

  it("accepts a source of exactly 1 MiB and rejects one byte over without any traffic", async () => {
    const bodies = captureBodies(`${API}/analysis/:analysisID/upload`, "Analysis Script Successfully Uploaded");

    await uploadAnalysisScriptConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID, filename: "big.js", source: "a".repeat(MAX_SCRIPT_SOURCE_BYTES) });
    expect(bodies).toHaveLength(1);

    const requests: string[] = [];
    mockServer.use(
      http.all(`${API}/*`, ({ request }) => {
        requests.push(request.url);
        return ok({});
      })
    );
    await expect(
      uploadAnalysisScriptConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID, filename: "big.js", source: "a".repeat(MAX_SCRIPT_SOURCE_BYTES + 1) })
    ).rejects.toThrow(/source/);
    expect(requests).toHaveLength(0);
  });

  it("rejects an externally-run analysis with no upload traffic", async () => {
    useAnalysisInfo({ run_on: "external" });
    const bodies = captureBodies(`${API}/analysis/:analysisID/upload`, "unused");

    await expect(uploadAnalysisScriptConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID, filename: "x.js", source: "1" })).rejects.toThrow(/external/);
    expect(bodies).toHaveLength(0);
  });

  it.each([{ runtime: "other" }, { runtime: undefined }])("rejects unsupported runtime %j with no upload traffic", async (overrides) => {
    useAnalysisInfo(overrides);
    const bodies = captureBodies(`${API}/analysis/:analysisID/upload`, "unused");

    await expect(uploadAnalysisScriptConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID, filename: "x.js", source: "1" })).rejects.toThrow(/runtime/);
    expect(bodies).toHaveLength(0);
  });
});

describe("download_analysis_script", () => {
  it("returns the fetched source fenced with the analysis ID and API-reported size", async () => {
    const result = await downloadAnalysisScriptConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });

    expect(result).toContain(ANALYSIS_ID);
    expect(result).toContain("fixture analysis script");
    expect(result).toContain("1 KB");
    expect(result).toMatch(/user-authored/i);
  });

  it("transparently decompresses a gzip-stored artifact", async () => {
    const source = 'console.log("gzip stored");\n';
    mockServer.use(http.get(STORAGE_PATH, () => new HttpResponse(new Uint8Array(gzipSync(Buffer.from(source, "utf8"))))));

    const result = await downloadAnalysisScriptConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });
    expect(result).toContain(source.trim());
  });

  it("passes the requested version through to the download endpoint", async () => {
    const versions: Array<string | null> = [];
    mockServer.use(
      http.get(`${API}/analysis/:analysisID/download`, ({ request }) => {
        versions.push(new URL(request.url).searchParams.get("version"));
        return ok(fixtures.analysisDownloadResponse);
      })
    );

    await downloadAnalysisScriptConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID, version: 3 });
    expect(versions).toEqual(["3"]);
  });

  it("never exposes the signed URL or its sentinel in results", async () => {
    const result = await downloadAnalysisScriptConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });
    expect(result).not.toContain(fixtures.SIGNED_SCRIPT_URL);
    expect(result).not.toContain("fake-signature-sentinel");
    expect(result).not.toContain("storage.tago.example");
  });

  it("redacts an SDK failure that embeds the request credential", async () => {
    mockServer.use(http.get(`${API}/analysis/:analysisID/download`, () => HttpResponse.json({ status: false, message: `Denied for ${REQUEST_TOKEN}` }, { status: 401 })));

    const error = await downloadAnalysisScriptConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID }).catch((caught) => caught as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
    expect((error as Error).message).not.toContain("fake-signature-sentinel");
  });

  it("surfaces adapter failures as controlled errors without the signed URL", async () => {
    mockServer.use(http.get(STORAGE_PATH, () => new HttpResponse("boom", { status: 500 })));

    const error = await downloadAnalysisScriptConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID }).catch((caught) => caught as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/HTTP 5xx/);
    expect((error as Error).message).not.toContain(fixtures.SIGNED_SCRIPT_URL);
    expect((error as Error).message).not.toContain("fake-signature-sentinel");
    expect((error as Error).message).not.toContain("storage.tago.example");
  });
});

describe("run_analysis", () => {
  it("acknowledges an asynchronous trigger without claiming completion", async () => {
    const result = await runAnalysisConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });

    expect(result).toContain("triggered");
    expect(result).toContain(ANALYSIS_ID);
    expect(result).toContain("read_analysis_console");
    expect(result).not.toContain("completed");
  });

  it("forwards the scope object in the run body", async () => {
    const bodies = captureBodies(`${API}/analysis/:analysisID/run`, { analysis_token: fixtures.FAKE_RUN_TOKEN });
    const scope = { device: fixtures.IDS.device, reason: "manual" };

    await runAnalysisConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID, scope });
    expect(bodies).toEqual([{ scope }]);
  });

  it("never exposes the run token in the result", async () => {
    const result = await runAnalysisConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });
    expect(result).not.toContain(fixtures.FAKE_RUN_TOKEN);
  });

  it("redacts a run token embedded in a failure message", async () => {
    mockServer.use(
      http.post(`${API}/analysis/:analysisID/run`, () =>
        HttpResponse.json({ status: false, message: `Run failed, token ${fixtures.FAKE_RUN_TOKEN} revoked for ${REQUEST_TOKEN}` }, { status: 400 })
      )
    );

    const error = await runAnalysisConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID }).catch((caught) => caught as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(fixtures.FAKE_RUN_TOKEN);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
  });
});

describe("read_analysis_console", () => {
  function useConsole(entries: unknown) {
    mockServer.use(http.get(`${API}/analysis/:analysisID`, () => ok({ id: ANALYSIS_ID, name: "Console Analysis", ...(entries === undefined ? {} : { console: entries }) })));
  }

  it("reads console output from the analysis info response", async () => {
    const result = await readAnalysisConsoleConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });

    expect(result).toContain("sentinel console line");
  });

  it("preserves the API order exactly and claims nothing about which end is newest", async () => {
    useConsole(["first-entry", "second-entry", "third-entry"]);

    const result = await readAnalysisConsoleConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });
    const positions = ["first-entry", "second-entry", "third-entry"].map((entry) => result.indexOf(entry));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(result).toContain("order returned by the API");
    expect(result).not.toMatch(/newest/i);
  });

  it("keeps only the last 200 of 201 entries and reports the omission", async () => {
    const entries = Array.from({ length: 201 }, (_, index) => `entry-${String(index).padStart(3, "0")}`);
    useConsole(entries);

    const result = await readAnalysisConsoleConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });
    expect(result).not.toContain("entry-000");
    expect(result).toContain("entry-001");
    expect(result).toContain("entry-200");
    expect(result).toContain("200 of 201");
    expect(result).toMatch(/1 entries .*omitted/);
  });

  it("enforces the 64 KiB byte cap by trimming whole entries from the front", async () => {
    const entries = Array.from({ length: 10 }, (_, index) => `E${index}-${"x".repeat(10236)}`);
    useConsole(entries);

    const result = await readAnalysisConsoleConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });
    expect(result).toContain("6 of 10");
    expect(result).toContain("E9-");
    expect(result).toContain("E4-");
    expect(result).not.toContain("E3-");
    expect(result).toMatch(/4 entries .*omitted/);
  });

  it("explains that output can be delayed when the console is empty or absent", async () => {
    for (const entries of [[], undefined]) {
      useConsole(entries);
      const result = await readAnalysisConsoleConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });
      expect(result).toContain(ANALYSIS_ID);
      expect(result).toMatch(/take time to appear/);
    }
  });

  it("raises an actionable not-found error when the analysis does not exist", async () => {
    mockServer.use(http.get(`${API}/analysis/:analysisID`, () => HttpResponse.json({ status: false, message: "Analysis Not Found" }, { status: 404 })));
    await expect(readAnalysisConsoleConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID })).rejects.toThrow("was not found. Check the ID with search_analyses.");
  });
});
