import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema } from "../../../utils/global-params.model";
import { NetworkQuery } from "@tago-io/sdk/lib/modules/Resources/integration.networks.types";

const networkListSchema = querySchema.extend({
  filter: z
    .object({
      id: z.string().describe("Filter network by ID. E.g: '123456789012345678901234'").length(24, "ID must be 24 characters long").optional(),
      name: z
        .string()
        .describe(`
          The name filter uses wildcard matching, so do not need to specify the exact network name.
          For example, searching for "sensor" finds networks like "Temperature Sensor" and "Humidity Sensor".
        `)
        .transform((val) => `*${val}*`)
        .optional(),
    })
    .describe("Filter object to apply to the query. Available filters: id, name")
    .optional(),
  fields: z
    .array(z.enum(["id", "name", "description", "device_parameters", "public", "created_at", "updated_at"]))
    .describe("Specific fields to include in the network list response. Available fields: id, name, description, device_parameters, public, created_at, updated_at")
    .optional(),
});

// Base schema without refinement - this provides the .shape property needed by MCP
const networkBaseSchema = z.object({
  operation: z.enum(["lookup"]).describe("The type of operation to perform on the network."),
  networkID: z.string().describe("The ID of the network to perform the operation on. Optional for lookup and create, but required for update and delete operations.").optional(),
  // Separate fields for different operations to maintain type safety
  lookupNetwork: networkListSchema.describe("The network to be listed. Required for lookup operations.").optional(),
}).describe("Schema for the network operation. The delete operation only requires the networkID.");

//TODO: add refine for create and update operations
const networkSchema = networkBaseSchema.refine(() => {
  // list and info operations are valid with or without query
  return true;
}, {
  message: "Invalid data structure for the specified operation. Create requires createNetwork, update requires updateNetwork.",
});

type NetworkSchema = z.infer<typeof networkSchema>;

function validateNetworkQuery(query: any): NetworkQuery | undefined {
  if (!query) {
    return undefined;
  };

  const amount = query.amount || 200;
  const fields = query.fields || ["id", "name", "description", "device_parameters", "public", "created_at", "updated_at"];

  return {
    amount,
    fields,
    ...query,
  };
}

/**
 * @description Fetches entities from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function networkOperationsTool(resources: Resources, params: NetworkSchema) {
  const validatedParams = networkSchema.parse(params);
  const { operation, networkID } = validatedParams;

  switch (operation) {
    case "lookup": {
      if (networkID) {
        const result = await resources.integration.networks.info(networkID as string);
        const markdownResponse = convertJSONToMarkdown(result);
        return markdownResponse;
      }
      const validatedQuery = validateNetworkQuery(validatedParams.lookupNetwork);
      const networks = await resources.integration.networks
        .list(validatedQuery)
        .catch((error) => {
          throw `**Error fetching networks:** ${(error as Error)?.message || error}`;
        });
      const markdownResponse = convertJSONToMarkdown(networks);
      return markdownResponse;
    }
  }
}

const networkLookupConfigJSON: IDeviceToolConfig = {
  name: "network-operations",
  description: `Perform operations on networks. It can be used to create, update, list and delete networks.
  
  <example>
    {
      "operation": "lookup",
      "lookupNetwork": {
        "amount": 100,
        "fields": ["id", "name", "description", "device_parameters", "public", "created_at", "updated_at"],
        "filter": {
          "name": "sensor",
          "tags": [{ "key": "entity_type", "value": "sensor" }]
        }
      }
    }
  </example>

  `,
  parameters: networkBaseSchema.shape,
  title: "Networks Operations",
  tool: networkOperationsTool,
};

export { networkLookupConfigJSON };
export { networkBaseSchema }; // export for testing purposes
