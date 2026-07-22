import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { applyCrossFieldValidation } from "../services/apply-cross-field";
import { toolCatalog } from "../services/catalog";
import { ServerContext } from "../services/types";
import { describeErrorSafely, redactSecrets } from "../utils/safe-error";
import { SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from "../utils/server-config";

/**
 * @description The sole MCP composition root. Every transport (stdio, HTTP,
 * Lambda) builds its server through this function, so all of them expose the
 * same metadata, instructions, and tool catalog. The context is request-scoped:
 * tool handlers receive credentials and region through it, never from process env.
 */
function buildServer(context: ServerContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: SERVER_INSTRUCTIONS });

  for (const toolConfig of toolCatalog) {
    server.registerTool(
      toolConfig.name,
      {
        title: toolConfig.title,
        description: toolConfig.description,
        inputSchema: toolConfig.parameters,
        annotations: toolConfig.annotations,
      },
      async (params) => {
        // Final request-credential boundary: everything a handler returns or
        // throws (SDK echoes, reflected inputs, user-authored source or
        // console content) passes through redaction so the request credential
        // never leaves the server.
        let result: string;
        try {
          applyCrossFieldValidation(toolConfig, params);
          result = await toolConfig.tool(context, params);
        } catch (error) {
          throw new Error(describeErrorSafely(error, [context.token]));
        }
        return { content: [{ type: "text" as const, text: redactSecrets(result, [context.token]) }] };
      }
    );
  }

  return server;
}

export { buildServer };
