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

// Base schema without refinement - this provides the .shape property needed by MCP
const entityBaseSchema = z.object({
  operation: z.enum(["lookup"]).describe("The type of operation to perform on the entity."),
  entityID: z.string().describe("The ID of the entity to perform the operation on.").optional(),
  // Separate fields for different operations to maintain type safety
  lookupEntity: entityListSchema.describe("The entity to be listed. Required for list operations.").optional(),
}).describe("Schema for the analysis operation.");

const entitySchema = entityBaseSchema.refine(() => {
  // list and info operations are valid with or without query
  return true;
}, {
  message: "Invalid data structure for the specified operation. Create requires createAnalysis, update requires updateAnalysis.",
});

type EntitySchema = z.infer<typeof entitySchema>;

function validateEntityQuery(query: any): EntityQuery | undefined {
  if (!query) {
    return undefined;
  };

  const amount = query.amount || 200;
  const fields = query.fields || ["id", "name", "schema", "index", "tags", "payload_decoder", "created_at", "updated_at"];

  return {
    amount,
    fields,
    ...query,
  };
}

/**
 * @description Fetches entities from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function entityLookupTool(resources: Resources, params: EntitySchema) {
  const validatedParams = entitySchema.parse(params);
  const { operation, entityID } = validatedParams;

  switch (operation) {
    case "lookup": {
      if (entityID) {
        const result = await resources.entities.info(entityID as string);
        const markdownResponse = convertJSONToMarkdown(result);
        return markdownResponse;
      }
      const validatedQuery = validateEntityQuery(validatedParams.lookupEntity);
      const entities = await resources.entities
        .list(validatedQuery)
        .catch((error) => {
          throw `**Error fetching entities:** ${(error as Error)?.message || error}`;
        });
      const markdownResponse = convertJSONToMarkdown(entities);
      return markdownResponse;
    }
  }
}

const entityLookupConfigJSON: IDeviceToolConfig = {
  name: "entity-operations",
  description: `Perform operations on entities. It can be used to create, update, list and delete entities.
  
  <example>
    {
      "operation": "lookup",
      "entityID": "1234567890",
      "lookupEntity": {
        "amount": 100,
        "fields": ["id", "name", "schema", "index", "tags", "payload_decoder", "created_at", "updated_at"],
        "filter": {
          "name": "sensor",
          "tags": [{ "key": "entity_type", "value": "sensor" }]
        }
      }
    }
  </example>

  `,
  parameters: entityBaseSchema.shape,
  title: "Entities Operations",
  tool: entityLookupTool,
};

export { entityLookupConfigJSON };
export { entityBaseSchema }; // export for testing purposes
