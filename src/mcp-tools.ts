import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { handlerUsersTools } from "./services/run-users/users.js";
import { handlerActionsTools } from "./services/actions/actions.js";
import { handlerDevicesTools } from "./services/devices/devices.js";
import { handlerAnalysesTools } from "./services/analysis/analysis.js";
import { handlerEntitiesTools } from "./services/entities/entities.js";
import { handlerProfileMetricsTools } from "./services/profile-metrics/profile-metrics.js";

/**
 * @description Register tools for the MCP server.
 */
async function handlerTools(server: McpServer, resources: Resources) {
  // Tools for TagoIO actions
  await handlerActionsTools(server, resources);
  // Tools for TagoIO analyses
  await handlerAnalysesTools(server, resources);
  // Tools for TagoIO devices
  await handlerDevicesTools(server, resources);
  // Tools for TagoIO entities
  await handlerEntitiesTools(server, resources);
  // Tools for TagoIO users
  await handlerUsersTools(server, resources);
  // Tools for TagoIO profile metrics
  await handlerProfileMetricsTools(server, resources);
}

export { handlerTools };
