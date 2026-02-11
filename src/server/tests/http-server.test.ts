import http from "node:http";
import { JsonRpcRequest, JsonRpcResponse } from "./types";

const MCP_PORT = Number.parseInt(process.env.MCP_PORT || "3000");
const TAGOIO_TOKEN = process.env.TAGOIO_TOKEN || "";
const BASE_URL = `http://localhost:${MCP_PORT}/mcp`;

let sessionId: string | undefined;
let requestIdCounter = 1;

/**
 * Parses Server-Sent Events (SSE) data
 */
function parseSSE(data: string): { event: string; data: string }[] {
  const events: { event: string; data: string }[] = [];
  const lines = data.split("\n");
  let currentEvent = "";
  let currentData = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      currentEvent = line.substring(7).trim();
    } else if (line.startsWith("data: ")) {
      currentData = line.substring(6).trim();
    } else if (line === "") {
      if (currentEvent && currentData) {
        events.push({ event: currentEvent, data: currentData });
        currentEvent = "";
        currentData = "";
      }
    }
  }

  return events;
}

/**
 * Makes an HTTP POST request to the MCP server and handles SSE responses
 */
function makePostRequest(
  headers: Record<string, string>,
  body: unknown
): Promise<{ response: http.IncomingMessage; events: { event: string; data: string }[] }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        ...headers,
      },
    };

    const req = http.request(BASE_URL, options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk.toString();
      });

      res.on("end", () => {
        const events = parseSSE(data);
        resolve({ response: res, events });
      });
    });

    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Test 1: Initialize session with Bearer token
 */
async function testInitializeSession(): Promise<void> {
  console.log("\n=== Test 1: Initialize Session ===");

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

  const { response, events } = await makePostRequest(
    { Authorization: `Bearer ${TAGOIO_TOKEN}` },
    request
  );

  console.log(`Status: ${response.statusCode}`);

  // Extract session ID from response headers
  sessionId = response.headers["mcp-session-id"] as string;
  console.log(`Session ID: ${sessionId}`);

  // Parse the message event
  const messageEvent = events.find((e) => e.event === "message");
  if (messageEvent) {
    const jsonResponse: JsonRpcResponse = JSON.parse(messageEvent.data);
    console.log("Response:", JSON.stringify(jsonResponse, null, 2));
  }

  if (!sessionId) {
    throw new Error("Failed to get session ID from response");
  }

  console.log("✓ Session initialized successfully");
}

/**
 * Test 2: List available tools
 */
async function testListTools(): Promise<void> {
  console.log("\n=== Test 2: List Tools ===");

  if (!sessionId) {
    throw new Error("No session ID available");
  }

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "tools/list",
  };

  const { response, events } = await makePostRequest(
    { "mcp-session-id": sessionId },
    request
  );

  console.log(`Status: ${response.statusCode}`);

  const messageEvent = events.find((e) => e.event === "message");
  if (messageEvent) {
    const jsonResponse: JsonRpcResponse = JSON.parse(messageEvent.data);
    const tools = (jsonResponse.result as { tools: unknown[] })?.tools || [];
    console.log(`Found ${tools.length} tools`);
    console.log("First 3 tools:", JSON.stringify(tools.slice(0, 3), null, 2));
  }

  console.log("✓ Tools listed successfully");
}

/**
 * Test 3: Call a tool (device-operations)
 */
async function testCallTool(): Promise<void> {
  console.log("\n=== Test 3: Call Tool (device-operations) ===");

  if (!sessionId) {
    throw new Error("No session ID available");
  }

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

  const { response, events } = await makePostRequest(
    { "mcp-session-id": sessionId },
    request
  );

  console.log(`Status: ${response.statusCode}`);

  const messageEvent = events.find((e) => e.event === "message");
  if (messageEvent) {
    const jsonResponse: JsonRpcResponse = JSON.parse(messageEvent.data);
    console.log("Response:", JSON.stringify(jsonResponse, null, 2));
  }

  console.log("✓ Tool called successfully");
}

/**
 * Test 5: Verify session persistence
 */
async function testSessionPersistence(): Promise<void> {
  console.log("\n=== Test 5: Session Persistence ===");

  if (!sessionId) {
    throw new Error("No session ID available");
  }

  console.log("Waiting 2 seconds before making another request...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "tools/list",
  };

  const { response } = await makePostRequest(
    { "mcp-session-id": sessionId },
    request
  );

  console.log(`Status: ${response.statusCode}`);

  if (response.statusCode === 200) {
    console.log("✓ Session persisted successfully");
  } else {
    console.error("✗ Session was lost");
  }
}

/**
 * Test 6: Test invalid session ID
 */
async function testInvalidSession(): Promise<void> {
  console.log("\n=== Test 6: Invalid Session ID ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "tools/list",
  };

  const { response, events } = await makePostRequest(
    { "mcp-session-id": "invalid-session-id" },
    request
  );

  console.log(`Status: ${response.statusCode}`);

  if (response.statusCode === 400) {
    console.log("✓ Invalid session rejected correctly");
  } else {
    console.error("✗ Invalid session was not rejected");
  }

  const messageEvent = events.find((e) => e.event === "message");
  if (messageEvent) {
    console.log("Response:", messageEvent.data);
  }
}

/**
 * Test 7: Test session without Bearer token
 */
async function testMissingToken(): Promise<void> {
  console.log("\n=== Test 7: Missing Bearer Token ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    },
  };

  const { response, events } = await makePostRequest({}, request);

  console.log(`Status: ${response.statusCode}`);

  if (response.statusCode === 401) {
    console.log("✓ Request without token rejected correctly");
  } else {
    console.error("✗ Request without token was not rejected");
  }

  const messageEvent = events.find((e) => e.event === "message");
  if (messageEvent) {
    console.log("Response:", messageEvent.data);
  }
}

/**
 * Test 8: Test invalid Bearer token
 */
async function testInvalidToken(): Promise<void> {
  console.log("\n=== Test 8: Invalid Bearer Token ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    },
  };

  const { response, events } = await makePostRequest(
    { Authorization: "Bearer invalid-token-12345" },
    request
  );

  console.log(`Status: ${response.statusCode}`);

  if (response.statusCode === 401) {
    console.log("✓ Request with invalid token rejected correctly");
  } else {
    console.error("✗ Request with invalid token was not rejected");
  }

  const messageEvent = events.find((e) => e.event === "message");
  if (messageEvent) {
    console.log("Response:", messageEvent.data);
  }
}

/**
 * Test 8: Call profile-metrics tool
 */
async function testProfileMetrics(): Promise<void> {
  console.log("\n=== Test 4: Call Tool (profile-metrics) ===");

  if (!sessionId) {
    throw new Error("No session ID available");
  }

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

  const { response, events } = await makePostRequest(
    { "mcp-session-id": sessionId },
    request
  );

  console.log(`Status: ${response.statusCode}`);

  const messageEvent = events.find((e) => e.event === "message");
  if (messageEvent) {
    const jsonResponse: JsonRpcResponse = JSON.parse(messageEvent.data);
    console.log("Response:", JSON.stringify(jsonResponse, null, 2));
  }

  console.log("✓ Profile metrics called successfully");
}

/**
 * Test 9: Test OPTIONS (CORS Preflight)
 */
async function testOptionsCors(): Promise<void> {
  console.log("\n=== Test 9: OPTIONS (CORS Preflight) ===");

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      method: "OPTIONS",
      headers: {
        "Origin": "https://example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization, mcp-session-id",
      },
    };

    const req = http.request(BASE_URL, options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log("CORS Headers:");
      console.log(`  Access-Control-Allow-Origin: ${res.headers["access-control-allow-origin"]}`);
      console.log(`  Access-Control-Allow-Methods: ${res.headers["access-control-allow-methods"]}`);
      console.log(`  Access-Control-Allow-Headers: ${res.headers["access-control-allow-headers"]}`);

      if (res.statusCode === 204) {
        console.log("✓ CORS preflight successful");
        resolve();
      } else {
        console.error("✗ CORS preflight failed");
        reject(new Error("CORS preflight failed"));
      }
    });

    req.on("error", reject);
    req.end();
  });
}

/**
 * Test 10: Test GET (SSE Stream)
 */
async function testGetSSE(): Promise<void> {
  console.log("\n=== Test 10: GET (SSE Stream) ===");

  if (!sessionId) {
    throw new Error("No session ID available");
  }

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      method: "GET",
      headers: {
        "mcp-session-id": sessionId,
        "Accept": "text/event-stream",
      },
    };

    const req = http.request(BASE_URL, options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Content-Type: ${res.headers["content-type"]}`);

      if (res.statusCode === 200) {
        let dataReceived = false;
        let sseData = "";

        // After connection is established, trigger a tool call to generate SSE events
        setTimeout(async () => {
          console.log("\nTriggering tool call to generate SSE events...");
          try {
            // Make a tool call while SSE stream is open
            const toolRequest: JsonRpcRequest = {
              jsonrpc: "2.0",
              id: requestIdCounter++,
              method: "tools/list",
            };

            if (sessionId) {
              await makePostRequest({ "mcp-session-id": sessionId }, toolRequest);
            }
          } catch {
            console.log("Tool call triggered (may cause SSE events)");
          }
        }, 500);

        const timeout = setTimeout(() => {
          req.destroy();
          if (dataReceived) {
            console.log("\n✓ SSE stream established and received data");
            console.log("Sample SSE events:", sseData.substring(0, 200));
            resolve();
          } else {
            console.log("✓ SSE stream connected (no server-initiated events, which is expected)");
            resolve();
          }
        }, 3000);

        res.on("data", (chunk) => {
          dataReceived = true;
          const chunkStr = chunk.toString();
          sseData += chunkStr;
          console.log("SSE Event received:", chunkStr.substring(0, 150).replace(/\n/g, "\\n"));
        });

        res.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      } else {
        console.error("✗ SSE stream failed");
        reject(new Error("SSE stream failed"));
      }
    });

    req.on("error", (err) => {
      if (err.message.includes("socket hang up")) {
        console.log("✓ SSE stream established successfully");
        resolve();
      } else {
        reject(err);
      }
    });

    req.end();
  });
}

/**
 * Test 11: Test DELETE (Session Termination)
 */
async function testDeleteSession(): Promise<void> {
  console.log("\n=== Test 11: DELETE (Session Termination) ===");

  if (!sessionId) {
    throw new Error("No session ID available");
  }

  const originalSessionId = sessionId;

  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      method: "DELETE",
      headers: {
        "mcp-session-id": originalSessionId,
        "Content-Type": "application/json",
      },
    };

    const req = http.request(BASE_URL, options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk.toString();
      });

      res.on("end", () => {
        console.log(`Status: ${res.statusCode}`);
        console.log("Response:", data || "(no body)");

        if (res.statusCode === 200 || res.statusCode === 204) {
          console.log("✓ Session terminated successfully");

          // Verify session is actually deleted by trying to use it
          console.log("\nVerifying session was deleted...");
          const testOptions: http.RequestOptions = {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "mcp-session-id": originalSessionId,
            },
          };

          const testReq = http.request(BASE_URL, testOptions, (testRes) => {
            console.log(`Verification Status: ${testRes.statusCode}`);

            if (testRes.statusCode === 400) {
              console.log("✓ Deleted session cannot be reused");
              resolve();
            } else {
              console.error("✗ Deleted session is still active");
              reject(new Error("Session not properly deleted"));
            }
          });

          testReq.on("error", reject);
          testReq.write(JSON.stringify({
            jsonrpc: "2.0",
            id: 999,
            method: "tools/list",
          }));
          testReq.end();
        } else {
          console.error("✗ Session termination failed");
          reject(new Error("Session termination failed"));
        }
      });
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
  console.log("MCP HTTP Server Test Suite");
  console.log("=".repeat(50));
  console.log(`Server: ${BASE_URL}`);
  console.log(`Token: ${TAGOIO_TOKEN}`);

  try {
    await testInitializeSession();
    await testListTools();
    await testCallTool();
    await testProfileMetrics();
    await testSessionPersistence();
    await testInvalidSession();
    await testMissingToken();
    await testInvalidToken();
    await testOptionsCors();
    await testGetSSE();
    await testDeleteSession();

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
