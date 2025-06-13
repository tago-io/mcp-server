import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EntityQuery } from "@tago-io/sdk/lib/modules/Resources/entities.types";

import { convertJSONToMarkdown } from "../../utils/markdown";
import { entityListModel } from "./entities.model";
import { genericIDSchema } from "../../utils/global-params.model";

/**
 * @description Get entities from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function _getEntities(resources: Resources, query?: EntityQuery) {
  const amount = query?.amount || 200;
  const fields = query?.fields || ["id", "name", "schema", "index", "tags", "payload_decoder", "created_at", "updated_at"];

  const entities = await resources.entities
    .list({
      amount,
      fields,
      ...query,
    })
    .catch((error) => {
      throw `**Error to get entities:** ${error}`;
    });

  const markdownResponse = convertJSONToMarkdown(entities);

  return markdownResponse;
}

/**
 * @description Get an entity by its ID and returns a Markdown-formatted response.
 */
async function _getEntityByID(resources: Resources, entityID: string) {
  const entity = await resources.entities.info(entityID).catch((error) => {
    throw `**Error to get entity by ID:** ${error}`;
  });

  const markdownResponse = convertJSONToMarkdown(entity);

  return markdownResponse;
}

/**
 * @description Handler for entities tools to register tools in the MCP server.
 */
async function handlerEntitiesTools(server: McpServer, resources: Resources) {
  server.tool("list-entities", "List all entities", entityListModel, { title: "List Entities" }, async (params) => {
    const result = await _getEntities(resources, params);
    return {
      content: [{ type: "text", text: result }],
    };
  });

  server.tool("get-entity-by-id", "Get an entity by its ID", genericIDSchema, { title: "Get Entity by ID" }, async (params) => {
    const result = await _getEntityByID(resources, params.id);
    return {
      content: [{ type: "text", text: result }],
    };
  });
}

export { handlerEntitiesTools };
