import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { integrationTools } from "./tools";

/**
 * @description Handler for network tools to register tools in the MCP server.
 */
async function handlerIntegrationTools(server: McpServer, resources: Resources) {
  for (const toolConfig of integrationTools) {
    server.tool(toolConfig.name, toolConfig.description, toolConfig.parameters, { title: toolConfig.title }, async (params) => {
      const result = await toolConfig.tool(resources, params);
      return { content: [{ type: "text", text: result }] };
    });
  }
}

export { handlerIntegrationTools };
