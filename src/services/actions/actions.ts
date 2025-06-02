import { Resources } from "@tago-io/sdk";

import { toMarkdown } from "../../utils/markdown";
import { ActionQuery } from "@tago-io/sdk/lib/types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { idModel } from "../../utils/global-params.model";
import { actionListModel } from "./actions.model";

/**
 * Fetches actions from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 * TODO: add more parameters to the query
 */
async function _getActions(resources: Resources, query?: ActionQuery) {
  const amount = query?.amount || 200;
  const fields = query?.fields || ["id", "active", "name", "description", "created_at", "updated_at", "last_triggered", "tags", "type", "action"];

  const actions = await resources.actions
    .list({
      amount,
      fields,
    })
    .catch((error) => {
      throw `**Error fetching actions:** ${(error as Error)?.message || error}`;
    });

  const markdownResponse = toMarkdown(actions);

  return markdownResponse;
}

/**
 * @description Get an action by its ID
 */
async function _getActionByID(resources: Resources, actionID: string) {
  const action = await resources.actions.info(actionID).catch((error) => {
    throw `**Error to get action by ID:** ${(error as Error)?.message || error}`;
  });

  const markdownResponse = toMarkdown(action);

  return markdownResponse;
}
/**
 * @description Handler for actions
 */
async function handlerActionsTools(server: McpServer, resources: Resources) {
  server.tool("list_actions", "List all actions", actionListModel, async (params) => {
    const result = await _getActions(resources, params);
    return {
      content: [{ type: "text", text: result }],
    };
  });

  server.tool("get_action_by_id", "Get an action by its ID", idModel, async (params) => {
    const result = await _getActionByID(resources, params.id);
    return {
      content: [{ type: "text", text: result }],
    };
  });
}

export { handlerActionsTools };
