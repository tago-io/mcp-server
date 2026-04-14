import { ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { JsonRpcRequest, JsonRpcResponse } from "./types";

const TAGOIO_TOKEN = process.env.TAGOIO_TOKEN || "";
const SERVER_PATH = resolve(__dirname, "../../../build/index.js");

let serverProcess: ChildProcess;
let requestIdCounter = 1;

const responseQueue: JsonRpcResponse[] = [];
const responseWaiters: Array<(response: JsonRpcResponse) => void> = [];
let stdoutBuffer = "";

/**
 * Initializes the stdout listener for parsing newline-delimited JSON responses.
 */
function initStdoutListener(childProcess: ChildProcess): void {
  childProcess.stdout?.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString();

    let newlineIndex = stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = stdoutBuffer.substring(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.substring(newlineIndex + 1);

      if (line.length > 0) {
        const parsed: JsonRpcResponse = JSON.parse(line);
        const waiter = responseWaiters.shift();
        if (waiter) {
          waiter(parsed);
        } else {
          responseQueue.push(parsed);
        }
      }

      newlineIndex = stdoutBuffer.indexOf("\n");
    }
  });
}

/**
 * Sends a JSON-RPC message to the server via stdin using newline-delimited JSON.
 */
function sendMessage(childProcess: ChildProcess, message: JsonRpcRequest): void {
  childProcess.stdin?.write(JSON.stringify(message) + "\n");
}

/**
 * Waits for the next JSON-RPC response from the server.
 */
function waitForResponse(_childProcess: ChildProcess, timeoutMs = 30000): Promise<JsonRpcResponse> {
  const queued = responseQueue.shift();
  if (queued) {
    return Promise.resolve(queued);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const idx = responseWaiters.indexOf(resolve);
      if (idx !== -1) {
        responseWaiters.splice(idx, 1);
      }
      reject(new Error(`Timeout waiting for response after ${timeoutMs}ms`));
    }, timeoutMs);

    responseWaiters.push((response: JsonRpcResponse) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

/**
 * Starts the MCP stdio server as a child process and waits until it's ready.
 */
async function startServer(): Promise<ChildProcess> {
  const child = spawn("node", [SERVER_PATH], {
    env: {
      ...process.env,
      TAGOIO_TOKEN,
      TAGOIO_API: process.env.TAGOIO_API || "https://api.us-e1.tago.io",
      LOG_LEVEL: "DEBUG",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  initStdoutListener(child);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server failed to start within 15s")), 15000);

    child.stderr?.on("data", (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) {
        console.log(`  [stderr] ${msg}`);
      }
      if (msg.includes("Tools registered")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with code ${code}`));
    });
  });

  return child;
}

/**
 * Test 1: Initialize the MCP session
 */
async function testInitialize(): Promise<void> {
  console.log("\n=== Test 1: Initialize Session ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: { listChanged: true },
      },
      clientInfo: {
        name: "stdio-test-client",
        version: "1.0.0",
      },
    },
  };

  sendMessage(serverProcess, request);
  const response = await waitForResponse(serverProcess);

  console.log("Response:", JSON.stringify(response, null, 2));

  if (!response.result) {
    throw new Error("Initialize failed: no result in response");
  }

  const result = response.result;
  if (result.protocolVersion !== "2024-11-05") {
    throw new Error(`Unexpected protocol version: ${result.protocolVersion}`);
  }

  console.log("Server:", JSON.stringify(result.serverInfo));
  console.log("Capabilities:", JSON.stringify(result.capabilities));
  console.log("OK - Session initialized successfully");
}

/**
 * Test 2: Send initialized notification
 */
async function testInitializedNotification(): Promise<void> {
  console.log("\n=== Test 2: Send Initialized Notification ===");

  const notification = {
    jsonrpc: "2.0" as const,
    method: "notifications/initialized",
  };

  serverProcess.stdin?.write(JSON.stringify(notification) + "\n");

  // Notifications don't get responses, wait briefly to ensure processing
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log("OK - Initialized notification sent");
}

/**
 * Test 3: List available tools
 */
async function testListTools(): Promise<void> {
  console.log("\n=== Test 3: List Tools ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "tools/list",
  };

  sendMessage(serverProcess, request);
  const response = await waitForResponse(serverProcess);

  if (!response.result) {
    throw new Error("List tools failed: no result");
  }

  const tools = (response.result.tools as { name: string }[]) || [];
  console.log(`Found ${tools.length} tools`);

  for (const tool of tools.slice(0, 5)) {
    console.log(`  - ${tool.name}`);
  }

  if (tools.length === 0) {
    throw new Error("No tools registered");
  }

  console.log("OK - Tools listed successfully");
}

/**
 * Test 4: Call device-operations tool (lookup)
 */
async function testCallDeviceOperations(): Promise<void> {
  console.log("\n=== Test 4: Call Tool (device-operations) ===");

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

  sendMessage(serverProcess, request);
  const response = await waitForResponse(serverProcess);

  console.log("Response:", JSON.stringify(response, null, 2));

  if (response.error) {
    throw new Error(`Tool call failed: ${response.error.message}`);
  }

  console.log("OK - Device operations called successfully");
}

/**
 * Test 5: Call profile-metrics tool
 */
async function testCallProfileMetrics(): Promise<void> {
  console.log("\n=== Test 5: Call Tool (profile-metrics) ===");

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

  sendMessage(serverProcess, request);
  const response = await waitForResponse(serverProcess);

  console.log("Response:", JSON.stringify(response, null, 2));

  if (response.error) {
    throw new Error(`Tool call failed: ${response.error.message}`);
  }

  console.log("OK - Profile metrics called successfully");
}

/**
 * Test 6: Call a non-existent tool
 */
async function testCallInvalidTool(): Promise<void> {
  console.log("\n=== Test 6: Call Invalid Tool ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "tools/call",
    params: {
      name: "non-existent-tool",
      arguments: {},
    },
  };

  sendMessage(serverProcess, request);
  const response = await waitForResponse(serverProcess);

  console.log("Response:", JSON.stringify(response, null, 2));

  const result = response.result as { isError?: boolean } | undefined;
  if (response.error || result?.isError) {
    console.log("OK - Invalid tool rejected correctly");
  } else {
    throw new Error("Expected error for non-existent tool");
  }
}

/**
 * Test 7: Send invalid JSON-RPC method
 */
async function testInvalidMethod(): Promise<void> {
  console.log("\n=== Test 7: Invalid Method ===");

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    id: requestIdCounter++,
    method: "invalid/method",
  };

  sendMessage(serverProcess, request);
  const response = await waitForResponse(serverProcess);

  console.log("Response:", JSON.stringify(response, null, 2));

  if (response.error) {
    console.log("OK - Invalid method rejected correctly");
  } else {
    throw new Error("Expected error for invalid method");
  }
}

/**
 * Test 8: Multiple rapid requests
 */
async function testMultipleRequests(): Promise<void> {
  console.log("\n=== Test 8: Multiple Rapid Requests ===");

  const responses: JsonRpcResponse[] = [];

  for (let i = 0; i < 3; i++) {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: requestIdCounter++,
      method: "tools/list",
    };
    sendMessage(serverProcess, request);
  }

  for (let i = 0; i < 3; i++) {
    const response = await waitForResponse(serverProcess);
    responses.push(response);
  }

  console.log(`Received ${responses.length} responses`);

  for (const response of responses) {
    if (response.error) {
      throw new Error(`Request ${response.id} failed: ${response.error.message}`);
    }
  }

  console.log("OK - All rapid requests handled successfully");
}

/**
 * Run all tests
 */
async function runTests(): Promise<void> {
  console.log("=".repeat(50));
  console.log("MCP STDIO Server Test Suite");
  console.log("=".repeat(50));
  console.log(`Server: ${SERVER_PATH}`);
  console.log(`Token: ${TAGOIO_TOKEN.substring(0, 8)}...`);

  serverProcess = await startServer();

  try {
    await testInitialize();
    await testInitializedNotification();
    await testListTools();
    await testCallDeviceOperations();
    await testCallProfileMetrics();
    await testCallInvalidTool();
    await testInvalidMethod();
    await testMultipleRequests();

    console.log("\n" + "=".repeat(50));
    console.log("OK - All tests completed successfully");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n" + "=".repeat(50));
    console.error("FAIL - Test suite failed:");
    console.error(error);
    console.error("=".repeat(50));
    process.exit(1);
  } finally {
    serverProcess.kill("SIGTERM");
  }
}

runTests();
