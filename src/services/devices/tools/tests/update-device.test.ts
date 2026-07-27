import { Resources } from "@tago-io/sdk";
import { http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { invokeTool } from "../../../../testing/invoke-tool";
import { API, ok } from "../../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { logger } from "../../../../utils/logger";
import { updateDeviceConfigJSON } from "../update-device";

const DEVICE_ID = "61f0000000000000000d0001";
const CONNECTOR_ID = "61f0000000000000000c0001";
const NETWORK_ID = "61f0000000000000000e0001";

// The live API reads non-expiring tokens back as expire_time null; TOKEN_B
// keeps the "never" string form some responses use. Both must be OMITTED on
// recreate: the create schema accepts only an interval string or date.
const TOKEN_A = {
  token: "00000000-0000-4000-8000-00000000000a",
  name: "Default",
  permission: "full",
  serie_number: "0000000000000001",
  expire_time: null,
};
const TOKEN_B = {
  token: "00000000-0000-4000-8000-00000000000b",
  name: "Secondary",
  permission: "write",
  serie_number: undefined,
  expire_time: "never",
};
const TOKEN_DATED = {
  token: "00000000-0000-4000-8000-00000000000c",
  name: "Dated",
  permission: "read",
  serie_number: undefined,
  expire_time: "2027-01-01T00:00:00.000Z",
};

// The real SDK tokenCreate response carries token/expire_date/permission but
// NO name; the tool must pair replacements with preflighted tokens itself.
function sdkCreateResponse(params: { name: string; permission: string }) {
  return { token: `new-token-for-${params.name}`, expire_date: "never", permission: params.permission };
}

function makeResources(tokens: Array<typeof TOKEN_A | typeof TOKEN_B>) {
  return {
    devices: {
      tokenList: vi.fn().mockResolvedValue(tokens),
      tokenDelete: vi.fn().mockResolvedValue("Token Successfully Removed"),
      tokenCreate: vi.fn().mockImplementation((_deviceID: string, params: { name: string; permission: string }) => Promise.resolve(sdkCreateResponse(params))),
      edit: vi.fn().mockResolvedValue("Device Successfully Updated"),
    },
  };
}

function callTool(resources: unknown, params: Record<string, unknown>) {
  return invokeTool(updateDeviceConfigJSON, makeTestContext({ resources }), params);
}

describe("update_device without credential rotation", () => {
  it("edits directly and never touches tokens for plain field changes", async () => {
    const resources = makeResources([TOKEN_A]);
    await callTool(resources, { device_id: DEVICE_ID, name: "Renamed" });

    expect(resources.devices.edit).toHaveBeenCalledWith(DEVICE_ID, expect.objectContaining({ name: "Renamed" }));
    expect(resources.devices.tokenList).not.toHaveBeenCalled();
    expect(resources.devices.tokenDelete).not.toHaveBeenCalled();
  });

  it("requires both connector and network when changing either", async () => {
    const resources = makeResources([TOKEN_A]);
    await expect(callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, confirm_token_rotation: true })).rejects.toThrow(/both/i);
    await expect(callTool(resources, { device_id: DEVICE_ID, network: NETWORK_ID, confirm_token_rotation: true })).rejects.toThrow(/both/i);
    expect(resources.devices.edit).not.toHaveBeenCalled();
  });
});

describe("update_device rotation confirmation", () => {
  it("returns a non-mutating explanation when rotation is not confirmed", async () => {
    const resources = makeResources([TOKEN_A, TOKEN_B]);
    const result = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID });

    expect(result).toContain("confirm_token_rotation");
    expect(result).toMatch(/rotat/i);
    expect(resources.devices.edit).not.toHaveBeenCalled();
    expect(resources.devices.tokenDelete).not.toHaveBeenCalled();
    expect(resources.devices.tokenCreate).not.toHaveBeenCalled();
  });

  it("requires confirmation for serial number changes too", async () => {
    const resources = makeResources([TOKEN_A]);
    const result = await callTool(resources, { device_id: DEVICE_ID, serie_number: "0000000000000002" });

    expect(result).toContain("confirm_token_rotation");
    expect(resources.devices.edit).not.toHaveBeenCalled();
  });
});

describe("update_device confirmed rotation", () => {
  it("deletes every token before the edit and recreates them all preserving properties", async () => {
    const resources = makeResources([TOKEN_A, TOKEN_B]);
    const result = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    expect(resources.devices.tokenDelete).toHaveBeenCalledTimes(2);
    expect(resources.devices.tokenDelete).toHaveBeenCalledWith(TOKEN_A.token);
    expect(resources.devices.tokenDelete).toHaveBeenCalledWith(TOKEN_B.token);

    const deleteOrders = resources.devices.tokenDelete.mock.invocationCallOrder;
    const editOrder = resources.devices.edit.mock.invocationCallOrder[0];
    expect(Math.max(...deleteOrders)).toBeLessThan(editOrder);

    expect(resources.devices.tokenCreate).toHaveBeenCalledTimes(2);
    // Non-expiring tokens (null or "never") must recreate WITHOUT expire_time:
    // the API create schema rejects null, and omission keeps them non-expiring.
    expect(resources.devices.tokenCreate).toHaveBeenCalledWith(DEVICE_ID, {
      name: TOKEN_A.name,
      permission: TOKEN_A.permission,
      serie_number: TOKEN_A.serie_number,
    });
    expect(resources.devices.tokenCreate).toHaveBeenCalledWith(DEVICE_ID, {
      name: TOKEN_B.name,
      permission: TOKEN_B.permission,
      serie_number: undefined,
    });

    // Every replacement secret is reported mapped to its original identity,
    // even though the create response itself carries no name.
    expect(result).toMatch(/Default[^\n]*new-token-for-Default/);
    expect(result).toMatch(/Secondary[^\n]*new-token-for-Secondary/);
  });

  it("preserves a dated expire_time on the recreated token", async () => {
    const resources = makeResources([TOKEN_DATED]);
    await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    expect(resources.devices.tokenCreate).toHaveBeenCalledWith(DEVICE_ID, expect.objectContaining({ expire_time: TOKEN_DATED.expire_time }));
  });

  it("applies a changed serial number to every recreated token", async () => {
    const resources = makeResources([TOKEN_A]);
    await callTool(resources, { device_id: DEVICE_ID, serie_number: "0000000000000099", confirm_token_rotation: true });

    expect(resources.devices.tokenCreate).toHaveBeenCalledWith(DEVICE_ID, expect.objectContaining({ serie_number: "0000000000000099" }));
  });

  it("updates token-less devices normally without confirmation prompts beyond the first", async () => {
    const resources = makeResources([]);
    const result = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    expect(resources.devices.edit).toHaveBeenCalled();
    expect(resources.devices.tokenDelete).not.toHaveBeenCalled();
    expect(resources.devices.tokenCreate).not.toHaveBeenCalled();
    // Controlled local confirmation, never the raw SDK acknowledgment.
    expect(result).toContain("updated");
    expect(result).not.toContain("Device Successfully Updated");
  });

  it("reports partial recreation failures explicitly with the successful replacements", async () => {
    const resources = makeResources([TOKEN_A, TOKEN_B]);
    resources.devices.tokenCreate.mockImplementation((_deviceID: string, params: { name: string; permission: string }) => {
      if (params.name === TOKEN_B.name) {
        return Promise.reject(new Error("recreate boom"));
      }
      return Promise.resolve(sdkCreateResponse(params));
    });

    const result = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    expect(result).toMatch(/Default[^\n]*new-token-for-Default/);
    expect(result).toContain("recreate boom");
    expect(result).toContain(TOKEN_B.name);
    expect(result).toMatch(/fail/i);
  });

  it("preflights every token across pages, not just the first 100", async () => {
    const manyTokens = Array.from({ length: 150 }, (_, index) => ({
      token: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name: `Token ${index}`,
      permission: "full",
      serie_number: undefined,
      expire_time: "never",
    }));
    const resources = makeResources([]);
    resources.devices.tokenList.mockImplementation((_deviceID: string, query: { page: number; amount: number }) => {
      const start = (query.page - 1) * query.amount;
      return Promise.resolve(manyTokens.slice(start, start + query.amount));
    });

    await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    expect(resources.devices.tokenList).toHaveBeenCalledTimes(2);
    expect(resources.devices.tokenDelete).toHaveBeenCalledTimes(150);
    expect(resources.devices.tokenCreate).toHaveBeenCalledTimes(150);
  });
});

describe("update_device failure recovery", () => {
  it("throws (safely) when the very first deletion fails and nothing was changed", async () => {
    const resources = makeResources([TOKEN_A, TOKEN_B]);
    resources.devices.tokenDelete.mockRejectedValue(new Error("delete boom"));

    const error = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true }).catch(
      (caught) => caught as Error
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("delete boom");
    expect((error as Error).message).not.toContain(TOKEN_A.token);
    expect((error as Error).message).not.toContain(TOKEN_B.token);
    expect(resources.devices.edit).not.toHaveBeenCalled();
    expect(resources.devices.tokenCreate).not.toHaveBeenCalled();
  });

  it("returns (not throws) recovered replacements when a later deletion fails after earlier ones succeeded", async () => {
    const resources = makeResources([TOKEN_A, TOKEN_B]);
    resources.devices.tokenDelete.mockImplementation((token: string) => (token === TOKEN_B.token ? Promise.reject(new Error("delete boom")) : Promise.resolve("ok")));

    const result = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    expect(resources.devices.edit).not.toHaveBeenCalled();
    expect(resources.devices.tokenCreate).toHaveBeenCalledTimes(1);
    expect(resources.devices.tokenCreate).toHaveBeenCalledWith(DEVICE_ID, expect.objectContaining({ name: TOKEN_A.name, serie_number: TOKEN_A.serie_number }));
    expect(result).toMatch(/Default[^\n]*new-token-for-Default/);
    expect(result).toContain("delete boom");
    expect(result).toContain(TOKEN_B.name);
    expect(result).toMatch(/not edited/i);
  });

  it("returns (not throws) every recovered replacement when the edit itself fails", async () => {
    const resources = makeResources([TOKEN_A, TOKEN_B]);
    resources.devices.edit.mockRejectedValue(new Error("edit exploded"));

    const result = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    expect(result).toContain("edit exploded");
    expect(resources.devices.tokenCreate).toHaveBeenCalledTimes(2);
    expect(resources.devices.tokenCreate).toHaveBeenCalledWith(DEVICE_ID, expect.objectContaining({ name: TOKEN_A.name, serie_number: TOKEN_A.serie_number }));
    expect(resources.devices.tokenCreate).toHaveBeenCalledWith(DEVICE_ID, expect.objectContaining({ name: TOKEN_B.name, serie_number: undefined }));
    expect(result).toMatch(/Default[^\n]*new-token-for-Default/);
    expect(result).toMatch(/Secondary[^\n]*new-token-for-Secondary/);
  });

  it("reports successful replacements AND named failures when recovery partially fails after a failed edit", async () => {
    const resources = makeResources([TOKEN_A, TOKEN_B]);
    resources.devices.edit.mockRejectedValue(new Error("edit exploded"));
    resources.devices.tokenCreate.mockImplementation((_deviceID: string, params: { name: string; permission: string }) => {
      if (params.name === TOKEN_B.name) {
        return Promise.reject(new Error("recreate boom"));
      }
      return Promise.resolve(sdkCreateResponse(params));
    });

    const result = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    expect(result).toContain("edit exploded");
    expect(result).toMatch(/Default[^\n]*new-token-for-Default/);
    expect(result).toContain("recreate boom");
    expect(result).toContain(TOKEN_B.name);
  });
});

describe("update_device secret redaction in failure detail", () => {
  // The SDK deletes tokens through DELETE /device/token/<token>, so a raw SDK
  // failure message can carry the full credential. None of these may escape
  // through thrown errors or returned recovery reports.
  const REQUEST_TOKEN = "a-0000000000000000000000000000000000";

  it("redacts the old token and request credential from a first-deletion failure", async () => {
    const resources = makeResources([TOKEN_A, TOKEN_B]);
    resources.devices.tokenDelete.mockRejectedValue(new Error(`DELETE https://api.us-e1.tago.io/device/token/${TOKEN_A.token} failed with 500 (auth ${REQUEST_TOKEN})`));

    const error = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true }).catch(
      (caught) => caught as Error
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(TOKEN_A.token);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
    expect((error as Error).message).toContain("failed with 500");
  });

  it("redacts secrets from a later-deletion failure report while still returning replacements", async () => {
    const resources = makeResources([TOKEN_A, TOKEN_B]);
    resources.devices.tokenDelete.mockImplementation((token: string) =>
      token === TOKEN_B.token ? Promise.reject(new Error(`DELETE /device/token/${TOKEN_B.token} failed (auth ${REQUEST_TOKEN})`)) : Promise.resolve("ok")
    );

    const result = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    expect(result).not.toContain(TOKEN_B.token);
    expect(result).not.toContain(REQUEST_TOKEN);
    // Replacement secrets are intentional output; the failure stays named.
    expect(result).toMatch(/Default[^\n]*new-token-for-Default/);
    expect(result).toContain(TOKEN_B.name);
  });

  it("redacts secrets from an edit failure report", async () => {
    const resources = makeResources([TOKEN_A, TOKEN_B]);
    resources.devices.edit.mockRejectedValue(new Error(`PUT /device failed after deleting ${TOKEN_A.token} and ${TOKEN_B.token} (auth ${REQUEST_TOKEN})`));

    const result = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    expect(result).not.toContain(TOKEN_A.token);
    expect(result).not.toContain(TOKEN_B.token);
    expect(result).not.toContain(REQUEST_TOKEN);
    expect(result).toContain("PUT /device failed after deleting");
    expect(result).toMatch(/Default[^\n]*new-token-for-Default/);
  });

  it("redacts secrets from token recreation failures, including already-created replacements", async () => {
    const resources = makeResources([TOKEN_A, TOKEN_B]);
    resources.devices.tokenCreate.mockImplementation((_deviceID: string, params: { name: string; permission: string }) => {
      if (params.name === TOKEN_B.name) {
        return Promise.reject(new Error(`POST /device/token failed; previous create returned new-token-for-Default (auth ${REQUEST_TOKEN}, replacing ${TOKEN_B.token})`));
      }
      return Promise.resolve(sdkCreateResponse(params));
    });

    const result = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    // The successful replacement is delivered once through the rotation
    // report, but the failure detail must not echo it, nor any old secret.
    expect(result).not.toContain(TOKEN_B.token);
    expect(result).not.toContain(REQUEST_TOKEN);
    const failureLine = result.split("\n").find((line) => line.includes("POST /device/token failed"));
    expect(failureLine).toBeDefined();
    expect(failureLine).not.toContain("new-token-for-Default");
    expect(result).toMatch(/Default[^\n]*new-token-for-Default/);
  });

  it("converts thrown non-Error values into a safe generic message", async () => {
    const resources = makeResources([TOKEN_A]);
    resources.devices.tokenDelete.mockRejectedValue({ token: TOKEN_A.token });

    const error = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true }).catch(
      (caught) => caught as Error
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(TOKEN_A.token);
  });
});

describe("update_device token secrecy", () => {
  it("never passes old or new token values through the logger", async () => {
    const spies = [vi.spyOn(logger, "debug"), vi.spyOn(logger, "info"), vi.spyOn(logger, "warn"), vi.spyOn(logger, "error")].map((spy) => spy.mockImplementation(() => {}));

    try {
      // Exercise the paths that handle secrets: success, failed edit, partial deletion.
      const success = makeResources([TOKEN_A, TOKEN_B]);
      await callTool(success, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

      const failedEdit = makeResources([TOKEN_A, TOKEN_B]);
      failedEdit.devices.edit.mockRejectedValue(new Error("edit exploded"));
      await callTool(failedEdit, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

      const failedDelete = makeResources([TOKEN_A, TOKEN_B]);
      failedDelete.devices.tokenDelete.mockImplementation((token: string) => (token === TOKEN_B.token ? Promise.reject(new Error("delete boom")) : Promise.resolve("ok")));
      await callTool(failedDelete, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

      const logged = spies
        .flatMap((spy) => spy.mock.calls.flat())
        .map((arg) => JSON.stringify(arg) ?? String(arg))
        .join(" ");
      expect(logged).not.toContain(TOKEN_A.token);
      expect(logged).not.toContain(TOKEN_B.token);
      expect(logged).not.toContain("new-token-for");
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  });
});

describe("update_device against the real SDK token routes (MSW)", () => {
  beforeAll(() => mockServer.listen(strictListenOptions));
  afterEach(() => mockServer.resetHandlers());
  afterAll(() => mockServer.close());

  it("creates replacement tokens via POST /device/token with the device id in the body", async () => {
    const createBodies: Array<Record<string, unknown>> = [];
    mockServer.use(
      http.post(`${API}/device/token`, async ({ request }) => {
        createBodies.push((await request.json()) as Record<string, unknown>);
        return ok({ token: "11111111-1111-4111-8111-111111111111", expire_date: "never", permission: "full" });
      })
    );

    const resources = new Resources({ token: "a-0000000000000000000000000000000000", region: TEST_REGION });
    const result = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    expect(createBodies).toHaveLength(1);
    expect(createBodies[0]).toMatchObject({ device: DEVICE_ID, name: "Default", permission: "full" });
    expect(result).toContain("11111111-1111-4111-8111-111111111111");
    expect(result).toMatch(/Default[^\n]*11111111-1111-4111-8111-111111111111/);
  });

  it("rotates through the default handlers without unhandled SDK traffic", async () => {
    const resources = new Resources({ token: "a-0000000000000000000000000000000000", region: TEST_REGION });
    const result = await callTool(resources, { device_id: DEVICE_ID, connector: CONNECTOR_ID, network: NETWORK_ID, confirm_token_rotation: true });

    // The default fixture create response is SDK-shaped (no name); the tool
    // must still map it back to the preflighted token's identity.
    expect(result).toMatch(/Default[^\n]*/);
    expect(result).toMatch(/rotated/i);
  });
});
