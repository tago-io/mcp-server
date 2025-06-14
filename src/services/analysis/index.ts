import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { analysisTools } from "./tools";

/**
 * @description Handler for analyses tools to register tools in the MCP server.
 */
async function handlerAnalysesTools(server: McpServer, resources: Resources) {
  for (const toolConfig of analysisTools) {
    server.tool(toolConfig.name, toolConfig.description, toolConfig.parameters, { title: toolConfig.title }, async (params) => {
      const result = await toolConfig.tool(resources, params);
      return { content: [{ type: "text", text: result }] };
    });
  }
}

export { handlerAnalysesTools };
