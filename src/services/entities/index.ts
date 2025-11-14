import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { entityTools } from "./tools";

/**
 * @description Handler for entities tools to register tools in the MCP server.
 */
async function handlerEntitiesTools(server: McpServer, resources: Resources) {
  for (const toolConfig of entityTools) {
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

export { handlerEntitiesTools };
