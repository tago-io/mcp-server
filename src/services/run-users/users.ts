import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UserQuery } from "@tago-io/sdk/lib/modules/Resources/run.types.js";

import { userListModel } from "./users.model.js";
import { toMarkdown } from "../../utils/markdown.js";
import { genericIDModel } from "../../utils/global-params.model.js";

/**
 * @description Get users list and returns a Markdown-formatted response.
 */
async function _getUsers(resources: Resources, query?: UserQuery) {
  const amount = query?.amount || 200;
  const fields = query?.fields || ["id", "name", "email", "timezone", "company", "phone", "language", "tags", "active", "last_login", "created_at", "updated_at"];

  const users = await resources.run
    .listUsers({
      amount,
      fields,
      ...query,
    })
    .catch((error) => {
      throw `**Error to get users:** ${error}`;
    });

  const markdownResponse = toMarkdown(users);

  return markdownResponse;
}

/**
 * @description Get user by ID and returns a Markdown-formatted response.
 */
async function _getUserByID(resources: Resources, userID: string) {
  const user = await resources.run.userInfo(userID).catch((error) => {
    throw `**Error to get user by ID:** ${error}`;
  });

  const markdownResponse = toMarkdown(user);

  return markdownResponse;
}

/**
 * @description Handle users tools to register tools in the MCP server.
 */
async function handlerUsersTools(server: McpServer, resources: Resources) {
  server.tool("list-users", "List all users", userListModel, { title: "List Users" }, async (params) => {
    const result = await _getUsers(resources, params);
    return { content: [{ type: "text", text: result }] };
  });

  server.tool("get-user-by-id", "Get user by ID", genericIDModel, { title: "Get User by ID" }, async (params) => {
    const result = await _getUserByID(resources, params.id);
    return { content: [{ type: "text", text: result }] };
  });
}

export { handlerUsersTools };
