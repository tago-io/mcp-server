import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

import { makeTestContext } from "../../../../testing/context";
import { createDeviceConfigJSON } from "../create-device";

const CONNECTOR_ID = "61f0000000000000000c0001";
const NETWORK_A = "61f0000000000000000e0001";
const NETWORK_B = "61f0000000000000000e0002";
const OTHER_NETWORK = "61f0000000000000000e0999";

function makeResources(networks: string[] | undefined) {
  return {
    integration: {
      connectors: {
        info: vi.fn().mockResolvedValue({ id: CONNECTOR_ID, name: "HTTP Connector", networks }),
      },
    },
    devices: {
      create: vi.fn().mockResolvedValue({ device_id: "61f0000000000000000d0001", token: "00000000-0000-4000-8000-000000000001" }),
      paramSet: vi.fn().mockResolvedValue("Params Successfully Updated"),
    },
  };
}

function callTool(resources: unknown, params: Record<string, unknown>) {
  return createDeviceConfigJSON.tool(makeTestContext({ resources }), params as never);
}

describe("create_device schema", () => {
  it("requires name and connector, no defaults", () => {
    const schema = z.object(createDeviceConfigJSON.parameters);
    expect(schema.safeParse({ name: "Device" }).success).toBe(false);
    expect(schema.safeParse({ connector: CONNECTOR_ID }).success).toBe(false);
    expect(schema.safeParse({ name: "Device", connector: CONNECTOR_ID }).success).toBe(true);
  });

  it("has no default connector or network anywhere in the schema", () => {
    const schema = z.object(createDeviceConfigJSON.parameters);
    const parsed = schema.parse({ name: "Device", connector: CONNECTOR_ID });
    expect(parsed.network).toBeUndefined();
    expect(createDeviceConfigJSON.description).not.toContain("62333bd36977fc001a2990c8");
    expect(createDeviceConfigJSON.description).not.toContain("62336c32ab6e0d0012e06c04");
  });
});

describe("create_device network resolution", () => {
  it("derives the network when the connector has exactly one", async () => {
    const resources = makeResources([NETWORK_A]);
    await callTool(resources, { name: "Device", connector: CONNECTOR_ID });

    expect(resources.devices.create).toHaveBeenCalledWith(expect.objectContaining({ connector: CONNECTOR_ID, network: NETWORK_A }));
  });

  it("errors without creating when the connector has no networks", async () => {
    const resources = makeResources([]);
    await expect(callTool(resources, { name: "Device", connector: CONNECTOR_ID })).rejects.toThrow(/no compatible network/i);
    expect(resources.devices.create).not.toHaveBeenCalled();
  });

  it("lists choices and steers to search_networks when multiple networks exist", async () => {
    const resources = makeResources([NETWORK_A, NETWORK_B]);
    const error = await callTool(resources, { name: "Device", connector: CONNECTOR_ID }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(NETWORK_A);
    expect((error as Error).message).toContain(NETWORK_B);
    expect((error as Error).message).toContain("search_networks");
    expect(resources.devices.create).not.toHaveBeenCalled();
  });

  it("never silently selects the first of multiple networks", async () => {
    const resources = makeResources([NETWORK_A, NETWORK_B]);
    await callTool(resources, { name: "Device", connector: CONNECTOR_ID }).catch(() => undefined);
    expect(resources.devices.create).not.toHaveBeenCalled();
  });

  it("accepts an explicitly supplied network that belongs to the connector", async () => {
    const resources = makeResources([NETWORK_A, NETWORK_B]);
    await callTool(resources, { name: "Device", connector: CONNECTOR_ID, network: NETWORK_B });

    expect(resources.devices.create).toHaveBeenCalledWith(expect.objectContaining({ network: NETWORK_B }));
  });

  it("rejects a supplied network that does not belong to the connector", async () => {
    const resources = makeResources([NETWORK_A, NETWORK_B]);
    await expect(callTool(resources, { name: "Device", connector: CONNECTOR_ID, network: OTHER_NETWORK })).rejects.toThrow(/does not belong/i);
    expect(resources.devices.create).not.toHaveBeenCalled();
  });
});

describe("create_device immutable requirements and encoding", () => {
  it("requires chunk_period and chunk_retention for immutable devices", async () => {
    const resources = makeResources([NETWORK_A]);
    await expect(callTool(resources, { name: "Device", connector: CONNECTOR_ID, type: "immutable" })).rejects.toThrow(/chunk_period/);
    expect(resources.devices.create).not.toHaveBeenCalled();
  });

  it("base64-encodes the payload decoder", async () => {
    const resources = makeResources([NETWORK_A]);
    await callTool(resources, { name: "Device", connector: CONNECTOR_ID, payload_decoder: "const x = 1;" });

    const created = resources.devices.create.mock.calls[0][0];
    expect(created.payload_decoder).toBe(Buffer.from("const x = 1;").toString("base64"));
  });

  it("surfaces configuration parameter failures without failing the create", async () => {
    const resources = makeResources([NETWORK_A]);
    resources.devices.paramSet.mockRejectedValue(new Error("param boom"));

    const result = await callTool(resources, {
      name: "Device",
      connector: CONNECTOR_ID,
      configuration_params: [{ key: "url", value: "https://x", sent: false }],
    });

    expect(result).toContain("param boom");
    expect(resources.devices.create).toHaveBeenCalled();
  });
});
