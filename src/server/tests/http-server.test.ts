import http from "node:http";
import { JsonRpcRequest, JsonRpcResponse } from "./types";

const MCP_PORT = Number.parseInt(process.env.MCP_PORT || "3000");
const TAGOIO_TOKEN = process.env.TAGOIO_TOKEN || "";
const BASE_URL = `http://localhost:${MCP_PORT}`;

let requestIdCounter = 1;

/**
 * Makes an HTTP POST request to the MCP server and returns the parsed JSON response.
 */
function makePostRequest(headers: Record<string, string>, body: unknown): Promise<{ response: http.IncomingMessage; json: JsonRpcResponse | null }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers,
      },
    };

    const req = http.request(BASE_URL, options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk.toString();
      });

      res.on("end", () => {
        try {
          const json: JsonRpcResponse = data ? JSON.parse(data) : null;
          resolve({ response: res, json });
        } catch {
          resolve({ response: res, json: null });
        }
      });
    });

    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Test 1: Initialize -- Bearer token required on every request
 */
async function testInitialize(): Promise<void> {
  console.log("\n=== Test 1: Initialize ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    },
  };

  const { response, json } = await makePostRequest({ Authorization: `Bearer ${TAGOIO_TOKEN}` }, request);

  console.log(`Status: ${response.statusCode}`);
  console.log("Response:", JSON.stringify(json, null, 2));

  if (response.statusCode !== 200) {
    throw new Error(`Expected 200, got ${response.statusCode}`);
  }
  if (!json?.result) {
    throw new Error("Missing result in initialize response");
  }

  console.log("✓ Initialize successful");
}

/**
 * Test 2: List tools -- Bearer token required on every request (no session)
 */
async function testListTools(): Promise<void> {
  console.log("\n=== Test 2: List Tools ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "tools/list",
  };

  const { response, json } = await makePostRequest({ Authorization: `Bearer ${TAGOIO_TOKEN}` }, request);

  console.log(`Status: ${response.statusCode}`);

  const tools = (json?.result as { tools: unknown[] } | undefined)?.tools ?? [];
  console.log(`Found ${tools.length} tools`);
  console.log("First 3 tools:", JSON.stringify(tools.slice(0, 3), null, 2));

  if (response.statusCode !== 200) {
    throw new Error(`Expected 200, got ${response.statusCode}`);
  }

  console.log("✓ Tools listed successfully");
}

/**
 * Test 3: Call a tool (device-operations)
 */
async function testCallTool(): Promise<void> {
  console.log("\n=== Test 3: Call Tool (device-operations) ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "tools/call",
    params: {
      name: "device-operations",
      arguments: {
        operation: "lookup",
        lookupDevice: {
          amount: 3,
        },
      },
    },
  };

  const { response, json } = await makePostRequest({ Authorization: `Bearer ${TAGOIO_TOKEN}` }, request);

  console.log(`Status: ${response.statusCode}`);
  console.log("Response:", JSON.stringify(json, null, 2));

  if (response.statusCode !== 200) {
    throw new Error(`Expected 200, got ${response.statusCode}`);
  }

  console.log("✓ Tool called successfully");
}

/**
 * Test 4: Call profile-metrics tool
 */
async function testProfileMetrics(): Promise<void> {
  console.log("\n=== Test 4: Call Tool (profile-metrics) ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "tools/call",
    params: {
      name: "profile-metrics",
      arguments: {
        type: "statistics",
      },
    },
  };

  const { response, json } = await makePostRequest({ Authorization: `Bearer ${TAGOIO_TOKEN}` }, request);

  console.log(`Status: ${response.statusCode}`);
  console.log("Response:", JSON.stringify(json, null, 2));

  if (response.statusCode !== 200) {
    throw new Error(`Expected 200, got ${response.statusCode}`);
  }

  console.log("✓ Profile metrics called successfully");
}

/**
 * Test 5: Missing Bearer token is rejected
 */
async function testMissingToken(): Promise<void> {
  console.log("\n=== Test 5: Missing Bearer Token ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
  };

  const { response } = await makePostRequest({}, request);

  console.log(`Status: ${response.statusCode}`);

  if (response.statusCode !== 401) {
    throw new Error(`Expected 401, got ${response.statusCode}`);
  }

  console.log("✓ Request without token rejected correctly");
}

/**
 * Test 6: Invalid Bearer token is rejected
 */
async function testInvalidToken(): Promise<void> {
  console.log("\n=== Test 6: Invalid Bearer Token ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
  };

  const { response } = await makePostRequest({ Authorization: "Bearer invalid-token-12345" }, request);

  console.log(`Status: ${response.statusCode}`);

  if (response.statusCode !== 401) {
    throw new Error(`Expected 401, got ${response.statusCode}`);
  }

  console.log("✓ Request with invalid token rejected correctly");
}

/**
 * Test 7: CORS preflight (OPTIONS)
 */
async function testOptionsCors(): Promise<void> {
  console.log("\n=== Test 7: OPTIONS (CORS Preflight) ===");

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization",
      },
    };

    const req = http.request(BASE_URL, options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`  Access-Control-Allow-Origin: ${res.headers["access-control-allow-origin"]}`);
      console.log(`  Access-Control-Allow-Methods: ${res.headers["access-control-allow-methods"]}`);
      console.log(`  Access-Control-Allow-Headers: ${res.headers["access-control-allow-headers"]}`);

      if (res.statusCode === 204) {
        console.log("✓ CORS preflight successful");
        resolve();
      } else {
        reject(new Error(`Expected 204, got ${res.statusCode}`));
      }
    });

    req.on("error", reject);
    req.end();
  });
}

/**
 * Test 8: GET is rejected (SSE not supported in stateless mode)
 */
async function testGetNotSupported(): Promise<void> {
  console.log("\n=== Test 8: GET (not supported) ===");

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      method: "GET",
      headers: { Accept: "text/event-stream" },
    };

    const req = http.request(BASE_URL, options, (res) => {
      console.log(`Status: ${res.statusCode}`);

      if (res.statusCode === 405) {
        console.log("✓ GET correctly rejected with 405");
        resolve();
      } else {
        reject(new Error(`Expected 405, got ${res.statusCode}`));
      }
    });

    req.on("error", reject);
    req.end();
  });
}

/**
 * Run all tests
 */
async function runTests(): Promise<void> {
  console.log("=".repeat(50));
  console.log("MCP HTTP Server Test Suite (Stateless)");
  console.log("=".repeat(50));
  console.log(`Server: ${BASE_URL}`);
  console.log(`Token: ${TAGOIO_TOKEN ? "[set]" : "[not set]"}`);

  try {
    await testInitialize();
    await testListTools();
    await testCallTool();
    await testProfileMetrics();
    await testMissingToken();
    await testInvalidToken();
    await testOptionsCors();
    await testGetNotSupported();

    console.log("\n" + "=".repeat(50));
    console.log("✓ All tests completed successfully");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n" + "=".repeat(50));
    console.error("✗ Test suite failed:");
    console.error(error);
    console.error("=".repeat(50));
    process.exit(1);
  }
}

runTests();
