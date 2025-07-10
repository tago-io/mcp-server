import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { EntityQuery } from "@tago-io/sdk/lib/modules/Resources/entities.types";
import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema, tagsObjectModel } from "../../../utils/global-params.model";
import { createOperationFactory } from "../../../utils/operation-factory";

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
  // fields: z
  //   .array(z.enum(["id", "name", "schema", "index", "tags", "payload_decoder", "created_at", "updated_at"]))
  //   .describe("Specific fields to include in the entity list response. Available fields: id, name, schema, index, tags, payload_decoder, created_at, updated_at")
  //   .optional(),
});

// Base schema without refinement - this provides the .shape property needed by MCP
const entityBaseSchema = z
  .object({
    operation: z.enum(["lookup"]).describe("The type of operation to perform on the entity."),
    entityID: z.string().describe("The ID of the entity to perform the operation on. Optional for lookup and create, but required for update and delete operations.").optional(),
    // Separate fields for different operations to maintain type safety
    lookupEntity: entityListSchema.describe("The entity to be listed. Required for lookup operations.").optional(),
  })
  .describe("Schema for the entity operation. The delete operation only requires the entityID.");

//TODO: add refine for create and update operations
const entitySchema = entityBaseSchema.refine(
  () => {
    // list and info operations are valid with or without query
    return true;
  },
  {
    message: "Invalid data structure for the specified operation. Create requires createAnalysis, update requires updateAnalysis.",
  }
);

type EntitySchema = z.infer<typeof entitySchema>;

function validateEntityQuery(query: any): EntityQuery | undefined {
  if (!query) {
    return undefined;
  }

  const amount = query.amount || 200;
  const fields = query.fields || ["id", "name", "schema", "index", "tags", "created_at", "updated_at"];

  return {
    amount,
    fields,
    ...query,
  };
}

// Operation handlers
async function handleLookupOperation(resources: Resources, params: EntitySchema): Promise<string> {
  const { entityID, lookupEntity } = params;

  if (entityID) {
    const result = await resources.entities.info(entityID);
    return convertJSONToMarkdown(result);
  }

  const validatedQuery = validateEntityQuery(lookupEntity);
  const entities = await resources.entities.list(validatedQuery).catch((error) => {
    throw `**Error fetching entities:** ${(error as Error)?.message || error}`;
  });

  return convertJSONToMarkdown(entities);
}

/**
 * @description Performs entity operations and returns a Markdown-formatted response.
 */
async function entityOperationsTool(resources: Resources, params: EntitySchema) {
  const validatedParams = entitySchema.parse(params);

  const factory = createOperationFactory<EntitySchema>().register("lookup", (params) => handleLookupOperation(resources, params));

  return factory.execute(validatedParams);
}

const entityOperationsConfigJSON: IDeviceToolConfig = {
  name: "entity-operations",
  description: `The EntityLookup tool searches and retrieves entities from TagoIO's next-generation database system. Entities represent TagoIO's advanced database solution that replaces Mutable Devices for complex data structures, offering customizable database tables with flexible schemas, advanced querying capabilities, and enhanced performance for structured data operations. This tool enables discovery and retrieval of entity metadata and configurations.

Use this tool when you need to find specific entities by name or tags, retrieve entity configurations and schemas, discover available entities in your TagoIO environment, or obtain entity IDs for subsequent operations. This tool is essential for entity management workflows, data structure discovery, and when building applications that interact with TagoIO's entity-based data storage system.

Do not use this tool for creating, updating, or deleting entities, as it performs read-only lookup operations. Avoid using it for retrieving actual data stored within entities—this tool returns entity metadata and configuration, not the data records themselves. This tool is not suitable for real-time data queries or complex analytical operations on entity data.

<example>
  {
    "operation": "lookup",
    "lookupEntity": {
      "amount": 100,
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
  tool: entityOperationsTool,
};

export { entityOperationsConfigJSON };
export { entityBaseSchema }; // export for testing purposes
