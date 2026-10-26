import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

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
    expect(bodies[0]).toEqual({ name: "Paused Analysis", runtime: "deno-rt2025", run_on: "tago", active: false });
  });

  it("sends multiple environment variables as an exact array", async () => {
    const bodies = captureBodies("post", `${API}/analysis`, fixtures.analysisCreateResponse);
    const variables = [
      { key: "API_URL", value: "https://api.example.com" },
      { key: "RETRIES", value: 3 },
      { key: "DRY_RUN", value: false },
    ];

    await invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Env Analysis", environment_variables: variables });

    expect(bodies[0]).toEqual({ name: "Env Analysis", runtime: "deno-rt2025", run_on: "tago", variables });
  });

  it("injects the default runtime and run_on when runtime is omitted, and honors an explicit runtime", async () => {
    const bodies = captureBodies("post", `${API}/analysis`, fixtures.analysisCreateResponse);

    await invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Default Runtime" });
    await invokeTool(createAnalysisConfigJSON, makeContext(), { name: "Node Analysis", runtime: "node-rt2025" });

    expect(bodies[0]).toEqual({ name: "Default Runtime", runtime: "deno-rt2025", run_on: "tago" });
    expect(bodies[1]).toEqual({ name: "Node Analysis", runtime: "node-rt2025", run_on: "tago" });
  });

  it.each(["bun-rt2026", "luau-rt2026"])("creates a %s analysis with that runtime on the wire", async (runtime) => {
    const bodies = captureBodies("post", `${API}/analysis`, fixtures.analysisCreateResponse);
    const params = { name: "New Runtime", runtime };

    expect(z.object(createAnalysisConfigJSON.parameters).safeParse(params).success).toBe(true);
    await invokeTool(createAnalysisConfigJSON, makeContext(), params);

    expect(bodies[0]).toEqual({ name: "New Runtime", runtime, run_on: "tago" });
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

describe("analysis Endpoint", () => {
  const ENDPOINT_URL = `${TEST_REGION.api}/endpoint/${ANALYSIS_ID}/`;

  function useStoredAnalysis(overrides: Record<string, unknown>) {
    mockServer.use(http.get(`${API}/analysis/:analysisID`, () => ok({ ...fixtures.analysisInfo, ...overrides })));
  }

  it("turns on the Endpoint of a Luau analysis, sending only the change and reporting the URL and the call_endpoint grant", async () => {
    useStoredAnalysis({ runtime: "luau-rt2026", endpoint: { active: false, access: "token" } });
    const bodies = captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");

    const result = await invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, endpoint: { active: true } });

    expect(bodies).toEqual([{ endpoint: { active: true } }]);
    expect(result).toContain(`Endpoint is on (token access) at ${ENDPOINT_URL}`);
    expect(result).toContain("`call_endpoint`");
  });

  it("sends endpoint together with other fields in one body on a Luau analysis, without echoing secrets", async () => {
    useStoredAnalysis({ runtime: "luau-rt2026", endpoint: { active: false, access: "token" } });
    const bodies = captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");
    const variables = [{ key: "API_KEY", value: "submitted-env-sentinel-value" }];

    const result = await invokeTool(updateAnalysisConfigJSON, makeContext(), {
      analysis_id: ANALYSIS_ID,
      name: "Orders",
      environment_variables: variables,
      endpoint: { active: true },
    });

    expect(bodies).toEqual([{ name: "Orders", variables, endpoint: { active: true } }]);
    expect(result).not.toContain(fixtures.analysisInfo.token);
    expect(result).not.toContain(fixtures.analysisInfo.variables[0].value);
    expect(result).not.toContain("submitted-env-sentinel-value");
  });

  it("refuses the whole update, not just endpoint, on a non-Luau analysis, without echoing secrets", async () => {
    const bodies = captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");

    const error = await invokeTool(updateAnalysisConfigJSON, makeContext(), {
      analysis_id: ANALYSIS_ID,
      name: "Orders",
      environment_variables: [{ key: "API_KEY", value: "submitted-env-sentinel-value" }],
      endpoint: { active: true },
    }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/only luau-rt2026 analyses can serve an Endpoint/);
    expect(bodies).toHaveLength(0);
    for (const secret of [fixtures.analysisInfo.token, fixtures.analysisInfo.variables[0].value, "submitted-env-sentinel-value"]) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("turns on public access and still names the call_endpoint grant, which token-carrying callers need in both modes", async () => {
    useStoredAnalysis({ runtime: "luau-rt2026", endpoint: { active: false, access: "token" } });
    const bodies = captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");

    const result = await invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, endpoint: { active: true, access: "public" } });

    expect(bodies).toEqual([{ endpoint: { active: true, access: "public" } }]);
    expect(result).toContain(`Endpoint is on (public access) at ${ENDPOINT_URL}`);
    expect(result).toContain("`call_endpoint`");
  });

  it.each([
    { stored: { active: false, access: "public" }, sent: { active: true } },
    { stored: { active: true, access: "token" }, sent: { access: "public" } },
  ])("reports the merged Endpoint state: stored $stored plus sent $sent is on with public access", async ({ stored, sent }) => {
    useStoredAnalysis({ runtime: "luau-rt2026", endpoint: stored });
    const bodies = captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");

    const result = await invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, endpoint: sent });

    expect(bodies).toEqual([{ endpoint: sent }]);
    expect(result).toContain(`Endpoint is on (public access) at ${ENDPOINT_URL}`);
    expect(result).not.toContain("inactive");
  });

  it.each([
    { label: "already inactive", stored: { active: false }, sent: {} },
    { label: "deactivated in the same request", stored: { active: true }, sent: { active: false } },
  ])("warns that the Endpoint answers 404 when the analysis is $label", async ({ stored, sent }) => {
    useStoredAnalysis({ runtime: "luau-rt2026", endpoint: { active: false, access: "token" }, ...stored });
    captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");

    const result = await invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, ...sent, endpoint: { active: true } });

    expect(result).toContain("Endpoint is on (token access)");
    expect(result).toContain("The analysis itself is inactive, so the Endpoint answers 404 until the analysis is activated");
  });

  it("does not warn when the same request reactivates an inactive analysis", async () => {
    useStoredAnalysis({ runtime: "luau-rt2026", active: false, endpoint: { active: false, access: "token" } });
    captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");

    const result = await invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, active: true, endpoint: { active: true } });

    expect(result).toContain("Endpoint is on (token access)");
    expect(result).not.toContain("inactive");
  });

  it("reports an Endpoint switched off without the grant hint", async () => {
    useStoredAnalysis({ runtime: "luau-rt2026", endpoint: { active: true, access: "public" } });
    captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");

    const result = await invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, endpoint: { active: false } });

    expect(result).toContain(`Endpoint is off. When on, it is served at ${ENDPOINT_URL}`);
    expect(result).not.toContain("call_endpoint");
  });

  it("refuses an Endpoint on a non-Luau analysis with no PUT traffic", async () => {
    const bodies = captureBodies("put", `${API}/analysis/:analysisID`, "Successfully Updated");

    await expect(invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, endpoint: { active: true } })).rejects.toThrow(
      /only luau-rt2026 analyses can serve an Endpoint; this analysis runs node-rt2025/
    );
    expect(bodies).toHaveLength(0);
  });

  it("refuses an empty endpoint object before any request", async () => {
    const requests: string[] = [];
    mockServer.events.on("request:start", ({ request }) => requests.push(request.url));

    await expect(invokeTool(updateAnalysisConfigJSON, makeContext(), { analysis_id: ANALYSIS_ID, endpoint: {} })).rejects.toThrow(/endpoint.*`active`, `access`/s);
    expect(requests).toEqual([]);
    mockServer.events.removeAllListeners();
  });

  it("accepts only the token and public access modes", () => {
    const schema = z.object(updateAnalysisConfigJSON.parameters).strict();

    expect(schema.safeParse({ analysis_id: ANALYSIS_ID, endpoint: { access: "public" } }).success).toBe(true);
    expect(schema.safeParse({ analysis_id: ANALYSIS_ID, endpoint: { access: "anyone" } }).success).toBe(false);
    expect(schema.safeParse({ analysis_id: ANALYSIS_ID, endpoint: { active: true, url: "x" } }).success).toBe(false);
  });

  it("shows the Endpoint in the concise get_analysis view of a Luau analysis only, and never the token", async () => {
    useStoredAnalysis({ runtime: "luau-rt2026", endpoint: { active: true, access: "token" } });
    const luau = await getAnalysisConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });
    mockServer.resetHandlers();
    useStoredAnalysis({ endpoint: { active: false, access: "token" } });
    const node = await getAnalysisConfigJSON.tool(makeContext(), { analysis_id: ANALYSIS_ID });

    expect(luau).toMatch(/endpoint[\s\S]*\| access \| token \|/);
    expect(luau).not.toContain(fixtures.analysisInfo.token);
    expect(node).not.toContain("endpoint");
  });
});
