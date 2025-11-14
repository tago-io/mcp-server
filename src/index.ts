#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Resources } from "@tago-io/sdk";

import { handlerTools } from "./mcp-tools";
import { getEnvVariables } from "./utils/get-env-variables";

if (process.env.NODE_ENV === "dev") {
  import("mcps-logger/console");
}

/**
 * @description Start the MCP server using stdio transport.
 */
async function startServer() {
  try { 
    const ENV = getEnvVariables();

    // Validate required environment variables
    if (!ENV.TAGOIO_TOKEN) {
      console.error("Error: TAGOIO_TOKEN environment variable is required");
      process.exit(1);
    }

    const region = !ENV.TAGOIO_API ? undefined :  { api: ENV.TAGOIO_API, sse: ENV.TAGOIO_API.replace("api", "sse") };

    // Initialize TagoIO Resources with the token
    const resources = new Resources({ token: ENV.TAGOIO_TOKEN, region });

    // Validate the connection to TagoIO API
    await resources.account.info().catch(() => {
      throw new Error("Failed to connect to TagoIO API. Please check your TAGOIO_TOKEN and TAGOIO_API configuration.");
    });

    // Create MCP server
    const mcpServer = new McpServer({
      name: "tagoio-mcp-server",
      version: "2.1.2",
    },
  {
    instructions: "Use this server to interact with your TagoIO account. Perform data analysis, collect profile metrics and manage your TagoIO devices..",
  });

    // Register all tools
    await handlerTools(mcpServer, resources);

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Connect server to transport
    await mcpServer.connect(transport);

    if (ENV.LOG_LEVEL === "DEBUG") {
      console.error("MCP server started successfully with stdio transport");
      console.error("Tools registered and ready to receive requests");
    }
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

startServer();
