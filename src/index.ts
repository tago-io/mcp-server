#!/usr/bin/env node

import * as dotenv from "dotenv";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Resources } from "@tago-io/sdk";

import { handlerTools } from "./mcp-tools";
import { environmentModel, IEnvironmentModel } from "./utils/config.model";

if (process.env.NODE_ENV === "dev") {
  import("mcps-logger/console");
}

// Load environment variables from .env file.
dotenv.config();

const ENV: IEnvironmentModel = environmentModel.parse({
  LOG_LEVEL: process.env.LOG_LEVEL,
  TAGOIO_TOKEN: process.env.TAGOIO_TOKEN,
  TAGOIO_API: process.env.TAGOIO_API,
});

/**
 * @description Start the MCP server using stdio transport.
 */
async function startServer() {
  try {
    // Validate required environment variables
    if (!ENV.TAGOIO_TOKEN) {
      console.error("Error: TAGOIO_TOKEN environment variable is required");
      process.exit(1);
    }

    // Set the TagoIO API endpoint
    process.env.TAGOIO_API = ENV.TAGOIO_API;

    // Initialize TagoIO Resources with the token
    const resources = new Resources({ token: ENV.TAGOIO_TOKEN });

    // Validate the connection to TagoIO API
    await resources.account.info().catch(() => {
      throw new Error("Failed to connect to TagoIO API. Please check your TAGOIO_TOKEN and TAGOIO_API configuration.");
    });

    // Create MCP server
    const mcpServer = new McpServer({
      name: "middleware-mcp-tagoio",
      version: "1.0.0",
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
