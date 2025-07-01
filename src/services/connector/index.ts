import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { connectorTools } from "./tools";

/**
 * @description Handler for connector tools to register tools in the MCP server.
 */
async function handlerConnectorTools(server: McpServer, resources: Resources) {
  for (const toolConfig of connectorTools) {
    server.tool(toolConfig.name, toolConfig.description, toolConfig.parameters, { title: toolConfig.title }, async (params) => {
      const result = await toolConfig.tool(resources, params);
      return { content: [{ type: "text", text: result }] };
    });
  }
}

export { handlerConnectorTools };
