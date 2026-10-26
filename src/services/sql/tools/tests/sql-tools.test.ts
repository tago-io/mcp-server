import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { buildServer } from "../../../../server/build-server";
import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { invokeTool } from "../../../../testing/invoke-tool";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { API, ok } from "../../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { MAX_RESPONSE_BYTES, renderExecution } from "../../render-execution";
import { createSqlQueryConfigJSON } from "../create-sql-query";
import { deleteSqlQueryConfigJSON } from "../delete-sql-query";
import { executeSqlQueryConfigJSON } from "../execute-sql-query";
import { getSqlQueryConfigJSON } from "../get-sql-query";
import { getSqlQueryVersionConfigJSON } from "../get-sql-query-version";
import { lookupSqlTablesConfigJSON } from "../lookup-sql-tables";
import { searchSqlQueriesConfigJSON } from "../search-sql-queries";
import { updateSqlQueryConfigJSON } from "../update-sql-query";

const SQL_ID = fixtures.IDS.sqlQuery;
const REQUEST_TOKEN = "p-0000000000000000000000000000000000";

function makeContext() {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  return makeTestContext({ resources, token: REQUEST_TOKEN, credentialKind: "profile" });
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

function captureUrls(path: string, response: unknown) {
  const urls: URL[] = [];
  mockServer.use(
    http.get(path, ({ request }) => {
      urls.push(new URL(request.url));
      return ok(response);
    })
  );
  return urls;
}

/** Calls a tool through a real MCP client/server pair, where API failures get their final formatting. */
async function callTool(name: string, args: Record<string, unknown>) {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  const server = buildServer({ resources, token: REQUEST_TOKEN, region: TEST_REGION, credentialKind: "profile" });
  const client = new Client({ name: "sql-tools-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.callTool({ name, arguments: args });
    return { isError: result.isError === true, text: (result.content as Array<{ text: string }>).map((entry) => entry.text).join("\n") };
  } finally {
    await client.close();
    await server.close();
  }
}

const apiError = (status: number, message: string) => HttpResponse.json({ status: false, message }, { status });

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("search_sql_queries", () => {
  it("wraps the name in wildcards, sends the default fields and the order, and renders the list", async () => {
    const urls = captureUrls(`${API}/sql`, fixtures.sqlQueryList);

    const result = await searchSqlQueriesConfigJSON.tool(makeContext(), { filter: { name: "hot", active: true, orderBy: "name,asc" } });

    const params = urls[0].searchParams;
    expect(params.get("filter[name]")).toBe("*hot*");
    expect(params.get("filter[active]")).toBe("true");
    const fields = [...params.entries()].filter(([key]) => /^fields\[\d+\]$/.test(key)).map(([, value]) => value);
    expect(fields).toEqual(["id", "name", "active", "tags", "created_at", "updated_at"]);
    expect(params.get("orderBy")).toBe("name,asc");
    expect(result).toContain("Hot compressors");
    expect(result).toContain(SQL_ID);
  });
});

describe("search_sql_queries tag filter", () => {
  it("sends the tag pairs as the API's indexed filter", async () => {
    const urls = captureUrls(`${API}/sql`, fixtures.sqlQueryList);

    await searchSqlQueriesConfigJSON.tool(makeContext(), { filter: { tags: [{ key: "audience", value: "portal" }] } });

    const params = urls[0].searchParams;
    expect(params.get("filter[tags][0][key]")).toBe("audience");
    expect(params.get("filter[tags][0][value]")).toBe("portal");
  });
});

describe("get_sql_query", () => {
  it("shows the SQL text, parameters, version, and session_context in the concise view", async () => {
    const result = await getSqlQueryConfigJSON.tool(makeContext(), { sql_query_id: SQL_ID });

    expect(result).toContain("SELECT variable, value, time FROM device(");
    expect(result).toContain("$1");
    expect(result).toContain("**session_context**: false");
    expect(result).toContain("**version**: 1");
  });
});

describe("create_sql_query", () => {
  it("sends only the supplied fields and reports the ID and version", async () => {
    const bodies = captureBodies("post", `${API}/sql`, fixtures.sqlQueryInfo);
    const params = { name: "Hot compressors", query: fixtures.sqlQueryInfo.query, params: [{ key: "$1", value: "30" }], cache_enabled: true };

    const result = await invokeTool(createSqlQueryConfigJSON, makeContext(), params);

    expect(bodies).toEqual([params]);
    expect(result).toContain(`SQL query created with ID \`${SQL_ID}\` (version 1)`);
    expect(result).not.toContain("session context");
  });

  it("explains session context when the saved query uses it", async () => {
    captureBodies("post", `${API}/sql`, { ...fixtures.sqlQueryInfo, session_context: true });

    const result = await invokeTool(createSqlQueryConfigJSON, makeContext(), { name: "Per user", query: "SELECT d.id FROM devices() AS d LIMIT 5" });

    expect(result).toContain("It uses session context");
  });

  it.each([
    ["a placeholder key that is not $n", { params: [{ key: "1", value: "30" }] }],
    [
      "a duplicated placeholder",
      {
        params: [
          { key: "$1", value: "30" },
          { key: "$1", value: "40" },
        ],
      },
    ],
    ["a non-string parameter value", { params: [{ key: "$1", value: 30 }] }],
    ["a cache TTL above 24 hours", { cache_ttl_seconds: 86_401 }],
  ])("rejects %s at the schema", (_label, extra) => {
    const schema = z.object(createSqlQueryConfigJSON.parameters).strict();

    expect(schema.safeParse({ name: "Q", query: "SELECT d.id FROM devices() AS d", ...extra }).success).toBe(false);
  });
});

describe("update_sql_query", () => {
  it("resends every stored field with the change on top, because the API replaces the whole query", async () => {
    const bodies = captureBodies("put", `${API}/sql/:sqlID`, { ...fixtures.sqlQueryInfo, version: 2 });

    const result = await invokeTool(updateSqlQueryConfigJSON, makeContext(), { sql_query_id: SQL_ID, params: [{ key: "$1", value: "40" }] });

    const { name, description, query, cache_enabled, cache_ttl_seconds, rate_limit_rpm, active, tags } = fixtures.sqlQueryInfo;
    expect(bodies).toEqual([{ name, description, query, params: [{ key: "$1", value: "40" }], cache_enabled, cache_ttl_seconds, rate_limit_rpm, active, tags }]);
    expect(result).toContain("saved as version 2");
  });

  it("clears nullable fields with an explicit null instead of resending the stored value", async () => {
    const bodies = captureBodies("put", `${API}/sql/:sqlID`, fixtures.sqlQueryInfo);

    await invokeTool(updateSqlQueryConfigJSON, makeContext(), { sql_query_id: SQL_ID, description: null, rate_limit_rpm: null });

    expect(bodies[0]).toMatchObject({ description: null, rate_limit_rpm: null, cache_ttl_seconds: fixtures.sqlQueryInfo.cache_ttl_seconds });
  });

  it("sends no PUT when the stored query cannot be read", async () => {
    mockServer.use(http.get(`${API}/sql/:sqlID`, () => apiError(404, "SQL Query can't be found")));
    const bodies = captureBodies("put", `${API}/sql/:sqlID`, fixtures.sqlQueryInfo);

    const result = await callTool("update_sql_query", { sql_query_id: SQL_ID, name: "Renamed" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("SQL Query can't be found");
    expect(bodies).toHaveLength(0);
  });

  it("reports when a metadata-only change keeps the version", async () => {
    captureBodies("put", `${API}/sql/:sqlID`, fixtures.sqlQueryInfo);

    const result = await invokeTool(updateSqlQueryConfigJSON, makeContext(), { sql_query_id: SQL_ID, name: "Renamed" });

    expect(result).toContain("still version 1");
  });

  it("refuses an update with no field before any request", async () => {
    const requests: string[] = [];
    mockServer.events.on("request:start", ({ request }) => requests.push(request.url));
    try {
      await expect(invokeTool(updateSqlQueryConfigJSON, makeContext(), { sql_query_id: SQL_ID })).rejects.toThrow(/at least one field/);
      expect(requests).toEqual([]);
    } finally {
      mockServer.events.removeAllListeners();
    }
  });
});

describe("delete_sql_query", () => {
  it("sends DELETE to the query path and says it is permanent", async () => {
    const deleted: string[] = [];
    mockServer.use(
      http.delete(`${API}/sql/:sqlID`, ({ params }) => {
        deleted.push(params.sqlID as string);
        return ok({ id: params.sqlID });
      })
    );

    const result = await deleteSqlQueryConfigJSON.tool(makeContext(), { sql_query_id: SQL_ID });

    expect(deleted).toEqual([SQL_ID]);
    expect(result).toMatch(/permanently deleted/);
  });
});

describe("get_sql_query_version", () => {
  it("reads the requested version and explains how to restore it", async () => {
    const versions: string[] = [];
    mockServer.use(
      http.get(`${API}/sql/:sqlID/version/:version`, ({ params }) => {
        versions.push(params.version as string);
        return ok(fixtures.sqlQueryVersion);
      })
    );

    const result = await getSqlQueryVersionConfigJSON.tool(makeContext(), { sql_query_id: SQL_ID, version: 1 });

    expect(versions).toEqual(["1"]);
    expect(result).toContain("SELECT variable, value, time");
    expect(result).toContain("update_sql_query");
  });
});

describe("API errors reach the caller unchanged", () => {
  it("names a version that is not in the query's history", async () => {
    mockServer.use(http.get(`${API}/sql/:sqlID/version/:version`, () => apiError(404, "SQL Query version can't be found")));

    const result = await callTool("get_sql_query_version", { sql_query_id: SQL_ID, version: 99 });

    expect(result).toEqual({ isError: true, text: expect.stringContaining("SQL Query version can't be found") });
  });

  it("says an inactive query cannot run", async () => {
    mockServer.use(http.post(`${API}/sql/:sqlID/execute`, () => apiError(400, "SQL query is inactive")));

    const result = await callTool("execute_sql_query", { sql_query_id: SQL_ID });

    expect(result).toEqual({ isError: true, text: expect.stringContaining("SQL query is inactive") });
  });

  it("reports the end of a fleet when paging past the last device", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    mockServer.use(
      http.post(`${API}/sql/:sqlID/execute`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return apiError(404, "No device found with tag device_type = sensor");
      })
    );

    const result = await callTool("execute_sql_query", { sql_query_id: SQL_ID, after_device: fixtures.IDS.device });

    expect(bodies).toEqual([{ after_device: fixtures.IDS.device }]);
    expect(result).toEqual({ isError: true, text: expect.stringContaining("No device found with tag") });
  });
});

describe("execute_sql_query", () => {
  it("sends only the supplied run options", async () => {
    const bodies = captureBodies("post", `${API}/sql/:sqlID/execute`, fixtures.sqlExecuteResult);
    const afterDevice = fixtures.IDS.device;

    await executeSqlQueryConfigJSON.tool(makeContext(), { sql_query_id: SQL_ID, params: [{ key: "$1", value: "40" }], test: true, after_device: afterDevice });
    await executeSqlQueryConfigJSON.tool(makeContext(), { sql_query_id: SQL_ID });

    expect(bodies).toEqual([{ params: [{ key: "$1", value: "40" }], test: true, after_device: afterDevice }, {}]);
  });

  it("renders the summary, typed columns in server order, and the rows", async () => {
    const result = await executeSqlQueryConfigJSON.tool(makeContext(), { sql_query_id: SQL_ID });

    expect(result).toContain("2 row(s) in 144 ms, executed fresh (counts against Data Output).");
    expect(result).toContain("| variable (string) | value (number) | time (timestamp) |");
    expect(result).toContain("| battery | 50.68 | 2026-10-26T18:55:52.663+00:00 |");
  });
});

describe("renderExecution", () => {
  it("states a cache hit", () => {
    expect(renderExecution({ ...fixtures.sqlExecuteResult, served_from_cache: true } as never)).toContain("served from cache (no Data Output used)");
  });

  it("explains an empty result instead of rendering an empty table", () => {
    const result = renderExecution({ columns: [], rows: [], row_count: 0, execution_ms: 3, served_from_cache: false });

    expect(result).toContain("No columns and no rows");
    expect(result).not.toContain("|");
  });

  it("renders JSON cells compactly and escapes pipes", () => {
    const result = renderExecution({
      columns: [
        { name: "params", type: "json" },
        { name: "name", type: "string" },
      ],
      rows: [{ params: [{ key: "a", value: "1" }], name: "left|right" }],
      row_count: 1,
      execution_ms: 1,
      served_from_cache: false,
    });

    expect(result).toContain('| [{"key":"a","value":"1"}] | left\\|right |');
  });

  it("cuts rows to the byte budget and says how many were shown", () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({ id: `row-${index}`, payload: "x".repeat(400) }));

    const result = renderExecution({
      columns: [
        { name: "id", type: "string" },
        { name: "payload", type: "string" },
      ],
      rows,
      row_count: rows.length,
      execution_ms: 9,
      served_from_cache: false,
    });

    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(MAX_RESPONSE_BYTES);
    expect(result).toMatch(/Showing \d+ of 500 rows to stay within/);
    expect(result).toContain("after_device");
  });
});

describe("lookup_sql_tables", () => {
  it("passes the filter and entity_id, and renders tables, resources, and functions", async () => {
    const urls = captureUrls(`${API}/sql/tables`, fixtures.sqlTables);

    const result = await lookupSqlTablesConfigJSON.tool(makeContext(), { filter: "compressor", entity_id: fixtures.IDS.entity, amount: 10 });

    const params = urls[0].searchParams;
    expect(params.get("filter")).toBe("compressor");
    expect(params.get("entity_id")).toBe(fixtures.IDS.entity);
    expect(params.get("amount")).toBe("10");
    expect(result).toContain("| device | device_tag | Device Data | variable:string, value:auto, time:timestamp |");
    expect(result).toContain(`| ${fixtures.IDS.device} | Compressor - Assembly North |`);
    expect(result).toContain("| session_user_tag | session | key |");
  });

  it("marks a per-entity table and hints the next page when a resource list is full", async () => {
    const devices = Array.from({ length: 2 }, (_, index) => ({ id: `61f0000000000000000d00${index}0`, name: `Device ${index}` }));
    captureUrls(`${API}/sql/tables`, {
      ...fixtures.sqlTables,
      tables: [{ function: "entity", label: "Entity Data", tag_form: "entity_tag", columns: [], dynamic: true }],
      resources: { devices, entities: [] },
    });

    const result = await lookupSqlTablesConfigJSON.tool(makeContext(), { amount: 2 });

    expect(result).toContain("| entity | entity_tag | Entity Data | per entity; pass entity_id |");
    expect(result).toContain("This page is full, so more devices may exist; request page 2");
    expect(result).not.toContain("more entities may exist");
  });

  it("says so when no device or entity matches the filter", async () => {
    captureUrls(`${API}/sql/tables`, { ...fixtures.sqlTables, resources: { devices: [], entities: [] } });

    const result = await lookupSqlTablesConfigJSON.tool(makeContext(), { filter: "nothing" });

    expect(result).toContain("### Devices\n\n_None matched._");
  });
});
