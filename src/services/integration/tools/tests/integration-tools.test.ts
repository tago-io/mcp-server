import { Resources } from "@tago-io/sdk";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { getConnectorBaseSchema, getConnectorConfigJSON } from "../get-connector";
import { getNetworkBaseSchema, getNetworkConfigJSON } from "../get-network";
import { searchConnectorsBaseSchema, searchConnectorsConfigJSON } from "../search-connectors";
import { searchNetworksBaseSchema, searchNetworksConfigJSON } from "../search-networks";

const CONNECTOR_ID = "662fa9d0d68e9d000a1cbf25";
const NETWORK_ID = "61f0000000000000000e0001";
const REQUEST_TOKEN = "a-0000000000000000000000000000000000";

function makeResources() {
  return {
    integration: {
      connectors: {
        info: vi.fn().mockResolvedValue({ id: CONNECTOR_ID, name: "HTTP Connector", public: true, networks: [NETWORK_ID] }),
        list: vi.fn().mockResolvedValue([{ id: CONNECTOR_ID, name: "HTTP Connector", public: true, networks: [NETWORK_ID] }]),
      },
      networks: {
        info: vi.fn().mockResolvedValue({ id: NETWORK_ID, name: "HTTP Network", public: true }),
        list: vi.fn().mockResolvedValue([{ id: NETWORK_ID, name: "HTTP Network", public: true }]),
      },
    },
  };
}

function extractExample(description: string): unknown {
  const match = description.match(/<example>([\s\S]*?)<\/example>/);
  expect(match, "tool description is missing an <example> block").not.toBeNull();
  return JSON.parse(match![1].trim());
}

describe("description examples", () => {
  it.each([
    ["search_connectors", searchConnectorsConfigJSON, searchConnectorsBaseSchema],
    ["get_connector", getConnectorConfigJSON, getConnectorBaseSchema],
    ["search_networks", searchNetworksConfigJSON, searchNetworksBaseSchema],
    ["get_network", getNetworkConfigJSON, getNetworkBaseSchema],
  ])("the %s example validates against its own schema", (_name, config, schema) => {
    const example = extractExample(config.description);
    // Strict so an example naming a parameter the tool no longer has fails here
    // (a stale `public` example survived a rename because strip mode ignored it).
    expect(schema.strict().safeParse(example).success).toBe(true);
    expect(z.object(config.parameters).strict().safeParse(example).success).toBe(true);
  });
});

describe("search_connectors", () => {
  // Regression: setting a name filter used to replace the whole filter
  // object, silently dropping the exclude_public_catalog mapping.
  it("keeps the presence filter when a name filter is also provided and exclude_public_catalog is true", async () => {
    const resources = makeResources();
    await searchConnectorsConfigJSON.tool(makeTestContext({ resources }), { name: "HTTP", exclude_public_catalog: true });

    const query = resources.integration.connectors.list.mock.calls[0][0];
    expect(query.filter).toEqual({ name: "*HTTP*", public: false });
  });

  // Regression: wildcard wrapping used to live in the schema, so
  // re-validating the same params produced a double-wrapped "**HTTP**".
  it("wraps the name wildcard exactly once, even for schema-parsed params", async () => {
    const resources = makeResources();
    const params = searchConnectorsBaseSchema.parse(searchConnectorsBaseSchema.parse({ name: "HTTP" }));
    await searchConnectorsConfigJSON.tool(makeTestContext({ resources }), params);

    const query = resources.integration.connectors.list.mock.calls[0][0];
    expect(query.filter).toEqual({ name: "*HTTP*" });
  });

  it("omits the API public key when exclude_public_catalog is false (default include)", async () => {
    const resources = makeResources();
    await searchConnectorsConfigJSON.tool(makeTestContext({ resources }), { exclude_public_catalog: false });

    const query = resources.integration.connectors.list.mock.calls[0][0];
    expect(query.filter).toBeUndefined();
  });

  // Records the exclude_public_catalog to filter.public mapping so it cannot change
  // silently; it asserts against a mock, so it cannot detect an upstream API change.
  it("sends the API public key only when exclude_public_catalog is true", async () => {
    const resources = makeResources();
    await searchConnectorsConfigJSON.tool(makeTestContext({ resources }), { exclude_public_catalog: true });

    const query = resources.integration.connectors.list.mock.calls[0][0];
    expect(query.filter).toEqual({ public: false });
  });

  it("omits the filter entirely when neither name nor exclude_public_catalog is given", async () => {
    const resources = makeResources();
    await searchConnectorsConfigJSON.tool(makeTestContext({ resources }), {});

    const query = resources.integration.connectors.list.mock.calls[0][0];
    expect(query.filter).toBeUndefined();
    expect(query.amount).toBe(10);
  });

  it("requests the networks field and renders it in concise mode", async () => {
    const resources = makeResources();
    const result = await searchConnectorsConfigJSON.tool(makeTestContext({ resources }), { name: "HTTP" });

    const query = resources.integration.connectors.list.mock.calls[0][0];
    expect(query.fields).toContain("networks");
    expect(result).toContain("networks");
    expect(result).toContain(NETWORK_ID);
  });

  it("rejects an amount above 50", () => {
    expect(searchConnectorsBaseSchema.safeParse({ amount: 51 }).success).toBe(false);
    expect(searchConnectorsBaseSchema.safeParse({ amount: 50 }).success).toBe(true);
  });

  it("supports page and fields selection", async () => {
    const resources = makeResources();
    await searchConnectorsConfigJSON.tool(makeTestContext({ resources }), { page: 2, fields: ["id", "name", "networks"] });

    const query = resources.integration.connectors.list.mock.calls[0][0];
    expect(query.page).toBe(2);
    expect(query.fields).toEqual(["id", "name", "networks"]);
  });

  it("steers to the next page when the page is full", async () => {
    const resources = makeResources();
    const result = await searchConnectorsConfigJSON.tool(makeTestContext({ resources }), { amount: 1 });

    expect(result).toContain("request page 2");
  });

  it("has no public top-level parameter after the exclude_public_catalog rename", () => {
    expect(Object.keys(searchConnectorsConfigJSON.parameters)).not.toContain("public");
    expect(Object.keys(searchConnectorsConfigJSON.parameters)).toContain("exclude_public_catalog");
    expect(searchConnectorsBaseSchema.shape).not.toHaveProperty("public");
    expect(searchConnectorsBaseSchema.shape).toHaveProperty("exclude_public_catalog");
  });
});

describe("get_connector", () => {
  it("rejects IDs that are not 24 characters", () => {
    expect(getConnectorBaseSchema.safeParse({ connector_id: "too-short" }).success).toBe(false);
    expect(getConnectorBaseSchema.safeParse({ connector_id: `${CONNECTOR_ID}0` }).success).toBe(false);
    expect(getConnectorBaseSchema.safeParse({ connector_id: CONNECTOR_ID }).success).toBe(true);
  });

  it("fetches the connector by id, including its networks", async () => {
    const resources = makeResources();
    const result = await getConnectorConfigJSON.tool(makeTestContext({ resources }), { connector_id: CONNECTOR_ID });

    expect(resources.integration.connectors.info).toHaveBeenCalledWith(CONNECTOR_ID, expect.arrayContaining(["networks"]));
    expect(result).toContain(NETWORK_ID);
  });
});

describe("search_networks", () => {
  // Regression (network variant): both filters must survive together.
  it("keeps the presence filter when a name filter is also provided and exclude_public_catalog is true", async () => {
    const resources = makeResources();
    await searchNetworksConfigJSON.tool(makeTestContext({ resources }), { name: "LoRa", exclude_public_catalog: true });

    const query = resources.integration.networks.list.mock.calls[0][0];
    expect(query.filter).toEqual({ name: "*LoRa*", public: false });
  });

  it("omits the API public key when exclude_public_catalog is false", async () => {
    const resources = makeResources();
    await searchNetworksConfigJSON.tool(makeTestContext({ resources }), { name: "LoRa", exclude_public_catalog: false });

    const query = resources.integration.networks.list.mock.calls[0][0];
    expect(query.filter).toEqual({ name: "*LoRa*" });
  });

  // Records the exclude_public_catalog to filter.public mapping so it cannot change
  // silently; it asserts against a mock, so it cannot detect an upstream API change.
  it("sends the API public key only when exclude_public_catalog is true", async () => {
    const resources = makeResources();
    await searchNetworksConfigJSON.tool(makeTestContext({ resources }), { exclude_public_catalog: true });

    const query = resources.integration.networks.list.mock.calls[0][0];
    expect(query.filter).toEqual({ public: false });
  });

  it("omits the filter entirely when neither name nor exclude_public_catalog is given", async () => {
    const resources = makeResources();
    await searchNetworksConfigJSON.tool(makeTestContext({ resources }), {});

    const query = resources.integration.networks.list.mock.calls[0][0];
    expect(query.filter).toBeUndefined();
    expect(query.amount).toBe(10);
  });

  it("rejects an amount above 50", () => {
    expect(searchNetworksBaseSchema.safeParse({ amount: 51 }).success).toBe(false);
  });

  it("supports page and fields selection", async () => {
    const resources = makeResources();
    await searchNetworksConfigJSON.tool(makeTestContext({ resources }), { page: 2, fields: ["id", "name"] });

    const query = resources.integration.networks.list.mock.calls[0][0];
    expect(query.page).toBe(2);
    expect(query.fields).toEqual(["id", "name"]);
  });

  it("steers to the next page when the page is full", async () => {
    const resources = makeResources();
    const result = await searchNetworksConfigJSON.tool(makeTestContext({ resources }), { amount: 1 });

    expect(result).toContain("request page 2");
  });

  it("has no public top-level parameter after the exclude_public_catalog rename", () => {
    expect(Object.keys(searchNetworksConfigJSON.parameters)).not.toContain("public");
    expect(Object.keys(searchNetworksConfigJSON.parameters)).toContain("exclude_public_catalog");
    expect(searchNetworksBaseSchema.shape).not.toHaveProperty("public");
    expect(searchNetworksBaseSchema.shape).toHaveProperty("exclude_public_catalog");
  });
});

describe("get_network", () => {
  it("rejects IDs that are not 24 characters", () => {
    expect(getNetworkBaseSchema.safeParse({ network_id: "too-short" }).success).toBe(false);
    expect(getNetworkBaseSchema.safeParse({ network_id: NETWORK_ID }).success).toBe(true);
  });

  it("fetches the network by id with an explicit fields list", async () => {
    const resources = makeResources();
    const result = await getNetworkConfigJSON.tool(makeTestContext({ resources }), { network_id: NETWORK_ID });

    expect(resources.integration.networks.info).toHaveBeenCalledWith(NETWORK_ID, expect.arrayContaining(["id", "name", "public"]));
    expect(result).toContain(NETWORK_ID);
  });
});

describe("integration list presence-only public filter (MSW)", () => {
  beforeAll(() => mockServer.listen(strictListenOptions));
  afterEach(() => mockServer.resetHandlers());
  afterAll(() => mockServer.close());

  function mswContext() {
    const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
    return makeTestContext({ resources, token: REQUEST_TOKEN });
  }

  // Assert on IDs so the private fixture name ("Private HTTP Connector") cannot
  // substring-match the public marketplace row.
  it("returns marketplace-public connectors when exclude_public_catalog is false", async () => {
    const result = await searchConnectorsConfigJSON.tool(mswContext(), { exclude_public_catalog: false });
    expect(result).toContain(fixtures.IDS.connector);
    expect(result).toContain(fixtures.connectorPrivateInfo.id);
  });

  it("omits marketplace-public connectors when exclude_public_catalog is true", async () => {
    const result = await searchConnectorsConfigJSON.tool(mswContext(), { exclude_public_catalog: true });
    expect(result).not.toContain(fixtures.IDS.connector);
    expect(result).toContain(fixtures.connectorPrivateInfo.id);
  });

  it("returns marketplace-public networks when exclude_public_catalog is omitted (default false)", async () => {
    const result = await searchNetworksConfigJSON.tool(mswContext(), {});
    expect(result).toContain(fixtures.IDS.network);
    expect(result).toContain(fixtures.networkPrivateInfo.id);
  });

  it("omits marketplace-public networks when exclude_public_catalog is true", async () => {
    const result = await searchNetworksConfigJSON.tool(mswContext(), { exclude_public_catalog: true });
    expect(result).not.toContain(fixtures.IDS.network);
    expect(result).toContain(fixtures.networkPrivateInfo.id);
  });
});
