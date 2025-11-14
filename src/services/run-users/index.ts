import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { userTools } from "./tools";

/**
 * @description Handler for users tools to register tools in the MCP server.
 */
async function handlerUsersTools(server: McpServer, resources: Resources) {
  for (const toolConfig of userTools) {
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

export { handlerUsersTools };
