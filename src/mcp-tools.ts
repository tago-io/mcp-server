import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { handlerActionsTools } from "./services/actions/actions";
import { handlerAnalysesTools } from "./services/analysis/analysis";
import { handlerDevicesTools } from "./services/devices/devices";

/**
 * @description Register tools for the MCP server.
 * TODO: add unit tests for these tools
 */
async function handlerTools(server: McpServer, resources: Resources) {
  // Tools for TagoIO actions
  await handlerActionsTools(server, resources);
  // Tools for TagoIO analyses
  await handlerAnalysesTools(server, resources);
  // Tools for TagoIO devices
  await handlerDevicesTools(server, resources);
}

export { handlerTools };
