import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { toolCatalog } from "../services/catalog";
import { makeTestContext } from "../testing/context";
import { buildServer } from "./build-server";

async function connectInMemory(context = makeTestContext()) {
  const server = buildServer(context);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

describe("buildServer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("exposes every catalog tool with title and annotations over the protocol", async () => {
    const { client, server } = await connectInMemory();

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(toolCatalog.map((tool) => tool.name).sort());

    for (const tool of tools) {
      const config = toolCatalog.find((entry) => entry.name === tool.name);
      expect(tool.title, `tool ${tool.name} has no title`).toBe(config?.title);
      expect(tool.annotations, `tool ${tool.name} has no annotations`).toEqual(config?.annotations);
      expect(tool.description, `tool ${tool.name} has no description`).toBe(config?.description);
    }

    await client.close();
    await server.close();
  });

  it("routes tool calls through the request context, not process env", async () => {
    // Regression: device-data classified its handler from the env token.
    // Here the env holds a device-style token while the context holds an
    // analysis token; the handler must follow the context and use resources.
    vi.stubEnv("TAGOIO_TOKEN", "d-env-token-must-not-be-used");

    const getDeviceData = vi.fn().mockResolvedValue([]);
    const tokenList = vi.fn();
    const context = makeTestContext({
      resources: { devices: { getDeviceData, tokenList } },
      token: "a-context-analysis-token",
    });

    const { client, server } = await connectInMemory(context);
    const result = await client.callTool({
      name: "read_device_data",
      arguments: { device_id: "507f1f77bcf86cd799439011" },
    });

    expect(result.isError).toBeFalsy();
    expect(getDeviceData).toHaveBeenCalledTimes(1);
    expect(tokenList).not.toHaveBeenCalled();

    await client.close();
    await server.close();
  });

  it("sends no credential at all to the snippets catalog host", async () => {
    vi.stubEnv("TAGOIO_TOKEN", "env-token-must-not-be-sent");

    const index = { runtime: "node-rt2025", schema_version: 1, generated_at: "2026-01-01T00:00:00.000Z", snippets: [] };
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(index), { status: 200, headers: { "content-type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);

    const context = makeTestContext({ token: "request-scoped-token" });
    const { client, server } = await connectInMemory(context);

    const result = await client.callTool({
      name: "search_code_examples",
      arguments: { query: "create a device", type: "analysis", runtime: "node-rt2025" },
    });

    expect(result.isError).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://snippets.tago.io/analysis/node-rt2025.json");
    expect(requestInit?.headers).toBeUndefined();

    await client.close();
    await server.close();
  });

  it("returns isError results for invalid tool input", async () => {
    const { client, server } = await connectInMemory();

    const result = await client.callTool({
      name: "read_device_data",
      arguments: { device_id: "too-short" },
    });

    expect(result.isError).toBe(true);

    await client.close();
    await server.close();
  });
});
