import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { invokeTool } from "../../../../testing/invoke-tool";
import { API, ok } from "../../../../testing/mocks/handlers";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { createAnalysisConfigJSON } from "../create-analysis";
import { deleteAnalysisConfigJSON } from "../delete-analysis";
import { getAnalysisConfigJSON } from "../get-analysis";
import { searchAnalysesConfigJSON } from "../search-analyses";
import { updateAnalysisConfigJSON } from "../update-analysis";

const ANALYSIS_ID = fixtures.IDS.analysis;
const REQUEST_TOKEN = "a-0000000000000000000000000000000000";
const SENTINEL_VALUE = "sentinel-env-value-do-not-print";

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

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("create_analysis wire bodies", () => {
  it("sends active: false explicitly (present and false) with defaults injected", async () => {
    const bodies = captureBodies("post", `${API}/analysis`, fixtures.analysisCreateResponse);

    await invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Paused Analysis", active: false });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ name: "Paused Analysis", runtime: "node-rt2025", run_on: "tago", active: false });
  });

  it("sends multiple environment variables as an exact array", async () => {
    const bodies = captureBodies("post", `${API}/analysis`, fixtures.analysisCreateResponse);
    const variables = [
      { key: "API_URL", value: "https://api.example.com" },
      { key: "RETRIES", value: 3 },
      { key: "DRY_RUN", value: false },
    ];

    await invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Env Analysis", environment_variables: variables });

    expect(bodies[0]).toEqual({ name: "Env Analysis", runtime: "node-rt2025", run_on: "tago", variables });
  });

  it("injects the default runtime and run_on when runtime is omitted, and honors an explicit runtime", async () => {
    const bodies = captureBodies("post", `${API}/analysis`, fixtures.analysisCreateResponse);

    await invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Default Runtime" });
    await invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Deno Analysis", runtime: "deno-rt2025" });

    expect(bodies[0]).toEqual({ name: "Default Runtime", runtime: "node-rt2025", run_on: "tago" });
    expect(bodies[1]).toEqual({ name: "Deno Analysis", runtime: "deno-rt2025", run_on: "tago" });
  });

  it("accepts 20 environment variables and rejects 21 before any request", async () => {
    const bodies = captureBodies("post", `${API}/analysis`, fixtures.analysisCreateResponse);
    const makeVariables = (count: number) => Array.from({ length: count }, (_, index) => ({ key: `KEY_${index}`, value: `value-${index}` }));

    await invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Twenty", environment_variables: makeVariables(20) });
    expect(bodies).toHaveLength(1);
    expect((bodies[0].variables as unknown[]).length).toBe(20);

    await expect(invokeTool(createAnalysisConfigJSON, makeContext(), { name: "TwentyOne", environment_variables: makeVariables(21) })).rejects.toThrow(/environment_variables/);
    expect(bodies).toHaveLength(1);
  });

  it("rejects duplicate environment variable keys before any request", async () => {
    const bodies = captureBodies("post", `${API}/analysis`, fixtures.analysisCreateResponse);
    const variables = [
      { key: "API_URL", value: "https://a.example.com" },
      { key: "API_URL", value: "https://b.example.com" },
    ];

    await expect(invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Dupes", environment_variables: variables })).rejects.toThrow(/unique/);
    expect(bodies).toHaveLength(0);
  });
});

describe("create_analysis token secrecy", () => {
  it("returns the new analysis ID and upload steering, never the created token", async () => {
    const result = await invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Fleet Report" });

    expect(result).toContain(ANALYSIS_ID);
    expect(result).toContain("upload_analysis_script");
    expect(result).not.toContain(fixtures.FAKE_ANALYSIS_TOKEN);
  });

  it("redacts an analysis token embedded in a create failure", async () => {
    mockServer.use(
      http.post(`${API}/analysis`, () =>
        HttpResponse.json({ status: false, message: `Analysis creation failed, minted token ${fixtures.FAKE_ANALYSIS_TOKEN} was revoked` }, { status: 400 })
      )
    );

    const error = await invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Broken" }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(fixtures.FAKE_ANALYSIS_TOKEN);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
  });

  it("redacts the request credential from create failures", async () => {
    mockServer.use(http.post(`${API}/analysis`, () => HttpResponse.json({ status: false, message: `Denied for ${REQUEST_TOKEN}` }, { status: 401 })));

    const error = await invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Denied" }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
  });
});

describe("update_analysis wire bodies", () => {
  it("sends the exact PUT body for a name-only edit: no runtime/run_on/undefined keys", async () => {
    const bodies = captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");

    await invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, name: "Renamed" });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ name: "Renamed" });
  });

  it("returns a controlled confirmation, never the raw SDK acknowledgment", async () => {
    const submittedName = "Renamed sensitive-submitted-sentinel";
    captureBodies("put", `${API}/analysis/:analysisID`, `Successfully Updated: ${submittedName} sdk-ack-sentinel`);

    const result = await invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, name: submittedName });

    expect(result).toContain(ANALYSIS_ID);
    expect(result).toMatch(/updated/i);
    expect(result).not.toContain("sdk-ack-sentinel");
    expect(result).not.toContain("Successfully Updated");
  });

  it("has no runtime or run_on parameters at all", () => {
    expect(updateAnalysisConfigJSON.parameters).not.toHaveProperty("runtime");
    expect(updateAnalysisConfigJSON.parameters).not.toHaveProperty("run_on");
  });

  it("sends an environment variable update as the exact variables array and never echoes values", async () => {
    const bodies = captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");
    const variables = [{ key: "SENTINEL_KEY", value: SENTINEL_VALUE }];

    const result = await invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, environment_variables: variables });

    expect(bodies[0]).toEqual({ variables });
    expect(result).not.toContain(SENTINEL_VALUE);
  });

  it("rejects an update with zero editable fields without traffic", async () => {
    const bodies = captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");

    await expect(invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID })).rejects.toThrow(/at least one field/);
    expect(bodies).toHaveLength(0);
  });

  it("rejects duplicate environment variable keys before any request", async () => {
    const bodies = captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");
    const variables = [
      { key: "K", value: "1" },
      { key: "K", value: "2" },
    ];

    await expect(invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, environment_variables: variables })).rejects.toThrow(/unique/);
    expect(bodies).toHaveLength(0);
  });
});

describe("delete_analysis", () => {
  it("sends DELETE to the analysis path and reports permanence", async () => {
    const deletedIds: string[] = [];
    mockServer.use(
      http.delete(`${API}/analysis/:analysisID`, ({ params }) => {
        deletedIds.push(params.analysisID as string);
        return ok("Successfully Removed");
      })
    );

    const result = await deleteAnalysisConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });

    expect(deletedIds).toEqual([ANALYSIS_ID]);
    expect(result).toContain(ANALYSIS_ID);
    expect(result).toMatch(/permanent/i);
  });
});

describe("safe projection of Analysis API responses", () => {
  // The fixture analysisInfo carries the sentinel token, variable value, and
  // console line; none may reach any output mode of search or get.
  const renderings = [
    { label: "search concise", run: () => searchAnalysesConfigJSON.tool(makeContext(), {}) },
    { label: "search detailed", run: () => searchAnalysesConfigJSON.tool(makeContext(), { response_format: "detailed" }) },
    { label: "get concise", run: () => getAnalysisConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID }) },
    { label: "get detailed", run: () => getAnalysisConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID, response_format: "detailed" }) },
  ];

  it.each(renderings)("$label never leaks token, variable values, or console output", async ({ run }) => {
    const output = await run();

    expect(output).toContain("Invoice Analysis");
    expect(output).not.toContain(fixtures.FAKE_ANALYSIS_TOKEN);
    expect(output).not.toContain(SENTINEL_VALUE);
    expect(output).not.toContain("sentinel console line");
  });

  it("exposes environment variable keys (not values) in detailed mode", async () => {
    const searchOutput = await searchAnalysesConfigJSON.tool(makeContext(), { response_format: "detailed" });
    const getOutput = await getAnalysisConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID, response_format: "detailed" });

    for (const output of [searchOutput, getOutput]) {
      expect(output).toContain("environment_variable_keys");
      expect(output).toContain("SENTINEL_KEY");
      expect(output).not.toContain(SENTINEL_VALUE);
    }
  });
});

describe("analysis mutation logging secrecy", () => {
  it("never passes sentinel secrets through console methods during create/update", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error"), vi.spyOn(console, "debug")].map((spy) =>
      spy.mockImplementation(() => {})
    );

    try {
      await invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Quiet", environment_variables: [{ key: "SENTINEL_KEY", value: SENTINEL_VALUE }] });
      await invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, environment_variables: [{ key: "SENTINEL_KEY", value: SENTINEL_VALUE }] });

      const logged = spies
        .flatMap((spy) => spy.mock.calls.flat())
        .map((arg) => JSON.stringify(arg) ?? String(arg))
        .join(" ");
      expect(logged).not.toContain(SENTINEL_VALUE);
      expect(logged).not.toContain(fixtures.FAKE_ANALYSIS_TOKEN);
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  });
});
