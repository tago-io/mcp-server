import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Resources } from "@tago-io/sdk";

import { deviceTools } from "./tools/index";

/**
 * @description Handler for devices tools to register tools in the MCP server.
 */
async function handlerDevicesTools(server: McpServer, resources: Resources) {
  for (const toolConfig of deviceTools) {
    server.registerTool(
      toolConfig.name,
      {
        title: toolConfig.title,
        description: toolConfig.description,
        inputSchema: toolConfig.parameters,
      },
      async (params) => {
        const result = await toolConfig.tool(resources, params);
        return { content: [{ type: "text", text: result }] };
      },
    );
  }
}

export { handlerDevicesTools };
