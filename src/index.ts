#!/usr/bin/env node

import { startStdioServer } from "./server/stdio-server";
import { startHttpServer } from "./server/http-server";

if (process.env.NODE_ENV === "dev") {
  import("mcps-logger/console");
}

/**
 * @description Main entry point - parse command line arguments and start the appropriate server
 */
async function main() {
  // Get command line arguments (skip node and script path)
  const args = process.argv.slice(2);

  // Determine the transport mode
  const mode = args[0]?.toLowerCase();

  switch (mode) {
    case "http":
      await startHttpServer();
      break;
    case "stdio":
    case undefined:
    case "":
      await startStdioServer();
      break;
    default:
      console.error(`Error: Unknown transport mode "${mode}"`);
      console.error("Usage: tago-mcp-server [stdio|http]");
      console.error("  stdio - Use STDIO transport (default)");
      console.error("  http  - Use HTTP transport with Streamable protocol");
      process.exit(1);
  }
}

main();
