import { Resources } from "@tago-io/sdk";
import { ActionQuery } from "@tago-io/sdk/lib/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { toMarkdown } from "../../utils/markdown.js";
import { actionListModel } from "./actions.model.js";
import { genericIDModel } from "../../utils/global-params.model.js";

/**
 * Fetches actions from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function _getActions(resources: Resources, query?: ActionQuery) {
  const amount = query?.amount || 200;
  const fields = query?.fields || ["id", "active", "name", "description", "created_at", "updated_at", "last_triggered", "tags", "type", "action"];

  const actions = await resources.actions
    .list({
      amount,
      fields,
      ...query,
    })
    .catch((error) => {
      throw `**Error fetching actions:** ${(error as Error)?.message || error}`;
    });

  const markdownResponse = toMarkdown(actions);

  return markdownResponse;
}

/**
 * @description Get an action by its ID and returns a Markdown-formatted response.
 */
async function _getActionByID(resources: Resources, actionID: string) {
  const action = await resources.actions.info(actionID).catch((error) => {
    throw `**Error to get action by ID:** ${(error as Error)?.message || error}`;
  });

  const markdownResponse = toMarkdown(action);

  return markdownResponse;
}

/**
 * @description Handler for actions tools to register tools in the MCP server.
 */
async function handlerActionsTools(server: McpServer, resources: Resources) {
  server.tool("list-actions", "List all actions", actionListModel, { title: "List Actions" }, async (params) => {
    const result = await _getActions(resources, params);
    return {
      content: [{ type: "text", text: result }],
    };
  });

  server.tool("get-action-by-id", "Get an action by its ID", genericIDModel, { title: "Get Action by ID" }, async (params) => {
    const result = await _getActionByID(resources, params.id);
    return {
      content: [{ type: "text", text: result }],
    };
  });
}

export { handlerActionsTools };
