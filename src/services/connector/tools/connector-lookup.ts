import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema } from "../../../utils/global-params.model";
import { ConnectorQuery } from "@tago-io/sdk/lib/modules/Resources/integration.connectors.types";

const connectorListSchema = querySchema.extend({
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
    })
    .describe("Filter object to apply to the query. Available filters: id, name")
    .optional(),
  fields: z
    .array(z.enum(["id", "name", "description", "networks"]))
    .describe("Specific fields to include in the connector list response. Available fields: id, name, description, networks")
    .optional(),
});

// Base schema without refinement - this provides the .shape property needed by MCP
const connectorBaseSchema = z.object({
  operation: z.enum(["lookup"]).describe("The type of operation to perform on the connector."),
  connectorID: z.string().describe("The ID of the connector to perform the operation on. Optional for lookup and create, but required for update and delete operations.").optional(),
  // Separate fields for different operations to maintain type safety
  lookupConnector: connectorListSchema.describe("The connector to be listed. Required for lookup operations.").optional(),
}).describe("Schema for the connector operation. The delete operation only requires the connectorID.");

//TODO: add refine for create and update operations
const connectorSchema = connectorBaseSchema.refine(() => {
  // list and info operations are valid with or without query
  return true;
}, {
  message: "Invalid data structure for the specified operation. Create requires createConnector, update requires updateConnector.",
});

type ConnectorSchema = z.infer<typeof connectorSchema>;

function validateConnectorQuery(query: any): ConnectorQuery | undefined {
  if (!query) {
    return undefined;
  };

  const amount = query.amount || 200;
  const fields = query.fields || ["id", "name", "description", "networks"];

  return {
    amount,
    fields,
    ...query,
  };
}

/**
 * @description Fetches entities from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function connectorOperationsTool(resources: Resources, params: ConnectorSchema) {
  const validatedParams = connectorSchema.parse(params);
  const { operation, connectorID } = validatedParams;

  switch (operation) {
    case "lookup": {
      if (connectorID) {
        const result = await resources.integration.connectors.info(connectorID as string);
        const markdownResponse = convertJSONToMarkdown(result);
        return markdownResponse;
      }
      const validatedQuery = validateConnectorQuery(validatedParams.lookupConnector);
      const connectors = await resources.integration.connectors
        .list(validatedQuery)
        .catch((error) => {
          throw `**Error fetching connectors:** ${(error as Error)?.message || error}`;
        });
      const markdownResponse = convertJSONToMarkdown(connectors);
      return markdownResponse;
    }
  }
}

const connectorLookupConfigJSON: IDeviceToolConfig = {
  name: "connector-operations",
  description: `Perform operations on connectors. It can be used to create, update, list and delete connectors.
  
  <example>
    {
      "operation": "lookup",
      "lookupConnector": {
        "amount": 100,
        "fields": ["id", "name", "description", "device_parameters", "public"],
        "filter": {
          "name": "sensor",
          "tags": [{ "key": "entity_type", "value": "sensor" }]
        }
      }
    }
  </example>

  `,
  parameters: connectorBaseSchema.shape,
  title: "Connectors Operations",
  tool: connectorOperationsTool,
};

export { connectorLookupConfigJSON };
export { connectorBaseSchema }; // export for testing purposes
