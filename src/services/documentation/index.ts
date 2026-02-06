import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Resources } from "@tago-io/sdk";
import { documentationTools } from "./tools";

/**
 * @description Handler for devices tools to register tools in the MCP server.
 */
async function handlerDocumentationTools(server: McpServer, resources: Resources) {
  const fullDocumentationTools = [...documentationTools];

  for (const toolConfig of fullDocumentationTools) {
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

export { handlerDocumentationTools };
