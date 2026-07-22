import { Server, createServer } from "node:http";
import { AddressInfo } from "node:net";
import { http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { toolCatalog } from "../../services/catalog";
import { API, ok } from "../../testing/mocks/handlers";
import { mockServer } from "../../testing/mocks/server";
import { SERVER_NAME, SERVER_VERSION } from "../../utils/server-config";
import { handleRequest } from "../http-server";

/**
 * Representative HTTP transport smoke: boots the real request handler on an
 * ephemeral port with MSW serving all TagoIO API traffic. Requests to the
 * local test server itself pass through the interceptor untouched.
 */
let server: Server;
let baseUrl: string;

const TOKEN = "a-0000000000000000000000000000000000";

function isLocalRequest(requestUrl: string): boolean {
  const url = new URL(requestUrl);
  return url.hostname === "127.0.0.1" || url.hostname === "localhost";
}

beforeAll(async () => {
  mockServer.listen({
    onUnhandledRequest: (request, print) => {
      if (isLocalRequest(request.url)) {
        return;
      }
      print.error();
    },
  });

  server = createServer((req, res) => handleRequest(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  mockServer.close();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

async function post(body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

describe("HTTP transport smoke", () => {
  it("rejects requests without a token", async () => {
    const { status, json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(status).toBe(401);
    expect(json.error.message).toContain("Unauthorized");
  });

  it("initializes with the shared server metadata", async () => {
    const { status, json } = await post(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "0.0.0" } },
      },
      { Authorization: `Bearer ${TOKEN}` }
    );

    expect(status).toBe(200);
    expect(json.result.serverInfo).toMatchObject({ name: SERVER_NAME, version: SERVER_VERSION });
    expect(json.result.instructions.length).toBeGreaterThan(100);
  });

  it("lists the full catalog", async () => {
    const { status, json } = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { Authorization: `Bearer ${TOKEN}` });

    expect(status).toBe(200);
    const names = json.result.tools.map((tool: { name: string }) => tool.name).sort();
    expect(names).toEqual(toolCatalog.map((tool) => tool.name).sort());
  });

  it("executes a device lookup end to end", async () => {
    const { status, json } = await post(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "search_devices", arguments: {} },
      },
      { Authorization: `Bearer ${TOKEN}` }
    );

    expect(status).toBe(200);
    expect(json.result.isError).toBeFalsy();
    expect(json.result.content[0].text).toContain("Temperature Sensor");
  });

  it("serves the health endpoint", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({ name: SERVER_NAME, version: SERVER_VERSION, status: "ok" });
  });
});

describe("HTTP region header allowlist", () => {
  afterEach(() => {
    mockServer.resetHandlers();
  });

  const initializeBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "0.0.0" } },
  };

  it.each(["us-e1", "eu-w1"])("accepts the %s region code", async (code) => {
    const { status } = await post(initializeBody, { Authorization: `Bearer ${TOKEN}`, "x-tagoio-region": code });
    expect(status).toBe(200);
  });

  // MSW rejects unhandled outbound traffic, so a 400 here also proves the
  // caller's credential was never forwarded to the attacker-supplied host.
  it.each([
    "http://evil.example.com",
    "https://127.0.0.1",
    "localhost",
    "api.internal:8080",
    "169.254.169.254",
    "us-e1/../eu-w1",
    "https://user:pass@api.us-e1.tago.io",
    "unknown-code",
  ])("rejects %s with 400 before any outbound request", async (value) => {
    const { status, json } = await post(initializeBody, { Authorization: `Bearer ${TOKEN}`, "x-tagoio-region": value });
    expect(status).toBe(400);
    expect(json.error.message).toContain("Invalid x-tagoio-region");
  });
});

describe("HTTP request-scoped credentials", () => {
  afterEach(() => {
    mockServer.resetHandlers();
    vi.unstubAllEnvs();
  });

  it("uses the header token for SDK calls even when TAGOIO_TOKEN is set in env", async () => {
    vi.stubEnv("TAGOIO_TOKEN", "a-9999999999999999999999999999999999");

    const seenTokens: (string | null)[] = [];
    mockServer.use(
      http.get(`${API}/info`, ({ request }) => {
        seenTokens.push(request.headers.get("token"));
        return ok({ type: "profile" });
      }),
      http.get(`${API}/device`, ({ request }) => {
        seenTokens.push(request.headers.get("token"));
        return ok([]);
      })
    );

    const headerToken = "a-1111111111111111111111111111111111";
    const { status, json } = await post(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search_devices", arguments: {} } },
      { Authorization: `Bearer ${headerToken}` }
    );

    expect(status).toBe(200);
    expect(json.result.isError).toBeFalsy();
    expect(seenTokens.length).toBeGreaterThanOrEqual(2);
    for (const seen of seenTokens) {
      expect(seen).toBe(headerToken);
    }
  });

  it("routes a device-token request through the supplied token, never tokenList", async () => {
    const deviceToken = "00000000-0000-4000-8000-00000000dada";
    const seenDataTokens: (string | null)[] = [];
    let tokenListCalled = false;

    mockServer.use(
      http.get(`${API}/data`, ({ request }) => {
        seenDataTokens.push(request.headers.get("token"));
        return ok([]);
      }),
      http.get(`${API}/device/token/:deviceID`, () => {
        tokenListCalled = true;
        return ok([]);
      })
    );

    const { status, json } = await post(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "read_device_data", arguments: { device_id: "61f0000000000000000d0001" } } },
      { Authorization: `Bearer ${deviceToken}` }
    );

    expect(status).toBe(200);
    expect(json.result.isError).toBeFalsy();
    expect(tokenListCalled).toBe(false);
    expect(seenDataTokens).toEqual([deviceToken]);
  });

  it("rejects unsupported token prefixes at authentication", async () => {
    const { status, json } = await post({ jsonrpc: "2.0", id: 6, method: "tools/list" }, { Authorization: "Bearer t-0000000000000000000000000000000000" });
    expect(status).toBe(401);
    expect(json.error.message).toContain("Unsupported token kind");
  });
});
