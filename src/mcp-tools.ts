import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { handlerDevicesTools } from "./services/devices/index";
import { handlerActionsTools } from "./services/actions/index";
import { handlerUsersTools } from "./services/run-users/index";
import { handlerEntitiesTools } from "./services/entities/index";
import { handlerAnalysesTools } from "./services/analysis/index";
import { handlerProfileMetricsTools } from "./services/profile/index";
import { handlerIntegrationTools } from "./services/integration/index";
import { handlerDocumentationTools } from "./services/documentation/index";

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
  // Tools for TagoIO integration
  await handlerIntegrationTools(server, resources);
  // Tools for TagoIO documentation
  await handlerDocumentationTools(server, resources);
}

export { handlerTools };
