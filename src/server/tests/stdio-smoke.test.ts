import { ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { toolCatalog } from "../../services/catalog";
import { SERVER_NAME, SERVER_VERSION } from "../../utils/server-config";

/**
 * Representative stdio transport smoke: spawns the real server via tsx with
 * the MSW wrapper (src/testing/start-mock-stdio.ts), so the child process
 * serves every TagoIO API request from fixtures (including the startup
 * token check) and never touches the network.
 */
const REPO_ROOT = resolve(__dirname, "../../..");
const TSX_BIN = resolve(REPO_ROOT, "node_modules/.bin/tsx");
const ENTRY = resolve(REPO_ROOT, "src/testing/start-mock-stdio.ts");

// Minimal shape of the JSON-RPC responses these smoke tests assert on; each
// result field is only present on the responses that actually carry it.
interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result: {
    serverInfo: { name: string; version: string };
    tools: { name: string }[];
    isError: boolean;
    content: { text: string }[];
  };
}

interface StdioClient {
  child: ChildProcess;
  request(method: string, params?: unknown, timeoutMs?: number): Promise<JsonRpcResponse>;
  notify(method: string, params?: unknown): void;
}

function spawnStdioServer(token: string): StdioClient {
  const child = spawn(TSX_BIN, [ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      TAGOIO_TOKEN: token,
      TAGOIO_API: "https://api.us-e1.tago.io",
      NODE_ENV: "test",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdoutBuffer = "";
  const pending = new Map<number, (message: JsonRpcResponse) => void>();
  let nextId = 1;

  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString();
    let newlineIndex = stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        const message = JSON.parse(line);
        const resolver = pending.get(message.id);
        if (resolver) {
          pending.delete(message.id);
          resolver(message);
        }
      }
      newlineIndex = stdoutBuffer.indexOf("\n");
    }
  });

  function request(method: string, params?: unknown, timeoutMs = 20000): Promise<JsonRpcResponse> {
    const id = nextId++;
    const message = { jsonrpc: "2.0", id, method, ...(params !== undefined ? { params } : {}) };
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout waiting for response to ${method}`));
      }, timeoutMs);
      pending.set(id, (response) => {
        clearTimeout(timeout);
        resolvePromise(response);
      });
      child.stdin?.write(`${JSON.stringify(message)}\n`);
    });
  }

  function notify(method: string, params?: unknown) {
    child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method, ...(params !== undefined ? { params } : {}) })}\n`);
  }

  return { child, request, notify };
}

async function initialize(client: StdioClient) {
  const initResult = await client.request("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.0" },
  });
  expect(initResult.result.serverInfo).toMatchObject({ name: SERVER_NAME, version: SERVER_VERSION });
  client.notify("notifications/initialized");
}

describe("stdio transport smoke (analysis token)", () => {
  let client: StdioClient;

  beforeAll(async () => {
    client = spawnStdioServer("a-0000000000000000000000000000000000");
    await initialize(client);
  }, 30000);

  afterAll(() => {
    client?.child.kill();
  });

  it("lists the full catalog", async () => {
    const response = await client.request("tools/list");
    const names = response.result.tools.map((tool: { name: string }) => tool.name).sort();
    expect(names).toEqual(toolCatalog.map((tool) => tool.name).sort());
  });

  it("executes an analysis lookup end to end", async () => {
    const response = await client.request("tools/call", {
      name: "search_analyses",
      arguments: {},
    });
    expect(response.result.isError).toBeFalsy();
    expect(response.result.content[0].text).toContain("Invoice Analysis");
  });
});

describe("stdio transport smoke (device token)", () => {
  // The fixture /info introspection binds this unprefixed token to the fixture
  // device, so the spawned composition carries the authenticated device ID.
  const FIXTURE_DEVICE_ID = "61f0000000000000000d0001";
  let client: StdioClient;

  beforeAll(async () => {
    client = spawnStdioServer("00000000-0000-4000-8000-000000000001");
    await initialize(client);
  }, 30000);

  afterAll(() => {
    client?.child.kill();
  });

  it("reads data for the authenticated device", async () => {
    const response = await client.request("tools/call", {
      name: "read_device_data",
      arguments: { device_id: FIXTURE_DEVICE_ID },
    });
    expect(response.result.isError).toBeFalsy();
    expect(response.result.content[0].text).toContain("temperature");
  });

  it("rejects data operations naming a different device", async () => {
    const response = await client.request("tools/call", {
      name: "delete_device_data",
      arguments: { device_id: "61f0000000000000000d0099", variables: ["humidity"] },
    });
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toContain("bound to device");
    expect(response.result.content[0].text).toContain(FIXTURE_DEVICE_ID);
  });
});
