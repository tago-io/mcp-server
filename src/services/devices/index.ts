import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { deviceTools } from "./tools/index";

/**
 * @description Handler for devices tools to register tools in the MCP server.
 */
async function handlerDevicesTools(server: McpServer, resources: Resources) {
  // Register tools from the new modular architecture
  for (const toolConfig of deviceTools) {
    server.tool(toolConfig.name, toolConfig.description, toolConfig.parameters, { title: toolConfig.title }, async (params) => {
      const result = await toolConfig.tool(resources, params);
      return { content: [{ type: "text", text: result }] };
    });
  }
}

export { handlerDevicesTools };
