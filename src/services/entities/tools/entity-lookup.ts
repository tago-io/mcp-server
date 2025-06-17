import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { EntityQuery } from "@tago-io/sdk/lib/modules/Resources/entities.types";

import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema, tagsObjectModel } from "../../../utils/global-params.model";

const entityListSchema = querySchema.extend({
  filter: z
    .object({
      id: z.string().describe("Filter entity by ID. E.g: '123456789012345678901234'").length(24, "ID must be 24 characters long").optional(),
      name: z
        .string()
        .describe(`
          The name filter uses wildcard matching, so do not need to specify the exact entity name.
          For example, searching for "sensor" finds entities like "Temperature Sensor" and "Humidity Sensor".
        `)
        .transform((val) => `*${val}*`)
        .optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'entity_type', value: 'sensor' }]").optional(),
    })
    .describe("Filter object to apply to the query. Available filters: id, name, tags")
    .optional(),
  fields: z
    .array(z.enum(["id", "name", "schema", "index", "tags", "payload_decoder", "created_at", "updated_at"]))
    .describe("Specific fields to include in the entity list response. Available fields: id, name, schema, index, tags, payload_decoder, created_at, updated_at")
    .optional(),
});

/**
 * @description Fetches entities from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function entityLookupTool(resources: Resources, query?: EntityQuery) {
  const amount = query?.amount || 200;
  const fields = query?.fields || ["id", "name", "schema", "index", "tags", "payload_decoder", "created_at", "updated_at"];

  const entities = await resources.entities
    .list({
      amount,
      fields,
      ...query,
    })
    .catch((error) => {
      throw `**Error fetching entities:** ${error}`;
    });

  const markdownResponse = convertJSONToMarkdown(entities);

  return markdownResponse;
}

const entityLookupConfigJSON: IDeviceToolConfig = {
  name: "entity-lookup",
  description: "Get a list of entities.",
  parameters: entityListSchema.shape,
  title: "Get Entity List",
  tool: entityLookupTool,
};

export { entityLookupConfigJSON };
export { entityListSchema }; // export for testing purposes
