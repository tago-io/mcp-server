import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

import { makeTestContext } from "../../../../testing/context";
import { getConnectorBaseSchema, getConnectorConfigJSON } from "../get-connector";
import { getNetworkBaseSchema, getNetworkConfigJSON } from "../get-network";
import { searchConnectorsBaseSchema, searchConnectorsConfigJSON } from "../search-connectors";
import { searchNetworksBaseSchema, searchNetworksConfigJSON } from "../search-networks";

const CONNECTOR_ID = "662fa9d0d68e9d000a1cbf25";
const NETWORK_ID = "61f0000000000000000e0001";

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
    expect(schema.safeParse(example).success).toBe(true);
    expect(z.object(config.parameters).safeParse(example).success).toBe(true);
  });
});

describe("search_connectors", () => {
  // Regression: setting a name filter used to replace the whole filter
  // object, silently dropping the public filter.
  it("keeps the public filter when a name filter is also provided", async () => {
    const resources = makeResources();
    await searchConnectorsConfigJSON.tool(makeTestContext({ resources }), { name: "HTTP", public: false });

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

  it("applies only the public filter when no name is given", async () => {
    const resources = makeResources();
    await searchConnectorsConfigJSON.tool(makeTestContext({ resources }), { public: true });

    const query = resources.integration.connectors.list.mock.calls[0][0];
    expect(query.filter).toEqual({ public: true });
  });

  it("omits the filter entirely when neither name nor public is given", async () => {
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
  it("keeps the public filter when a name filter is also provided", async () => {
    const resources = makeResources();
    await searchNetworksConfigJSON.tool(makeTestContext({ resources }), { name: "LoRa", public: true });

    const query = resources.integration.networks.list.mock.calls[0][0];
    expect(query.filter).toEqual({ name: "*LoRa*", public: true });
  });

  it("omits the filter entirely when neither name nor public is given", async () => {
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
