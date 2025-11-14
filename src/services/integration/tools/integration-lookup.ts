import { z } from "zod/v3";
import { ConnectorQuery, NetworkQuery, Resources } from "@tago-io/sdk";
import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";

const integrationQuerySchema = z.object({
  type: z.enum(["connector", "network"]).describe("The type of resource to query - either connector or network"),
  id: z.string().describe("The exact ID of the resource to lookup").optional(),
  name: z.string().describe("The full or partial name of the resource to lookup").optional(),
  public: z.boolean().describe("Filter by public status. When set to false, it will return only private resources.").optional(),
});

// Base schema without refinement - this provides the .shape property needed by MCP
const integrationBaseSchema = z
  .object({
    query: z.array(integrationQuerySchema).min(1).describe("Array of query objects to lookup connectors and networks"),
  })
  .describe("Schema for the integration operation.");

type IntegrationQuery = z.infer<typeof integrationQuerySchema>;
type IntegrationSchema = z.infer<typeof integrationBaseSchema>;

function validateNetworkQuery(queryObj: IntegrationQuery): NetworkQuery | undefined {
  const query: NetworkQuery = {
    amount: 10,
    fields: ["id", "name", "public"],
  };

  if ("public" in queryObj) {
    query.filter = {
      public: queryObj.public,
    };
  }

  if (queryObj.name) {
    query.filter = {
      name: `*${queryObj.name}*`,
    };
  }

  return query;
}

function validateConnectorQuery(queryObj: IntegrationQuery): ConnectorQuery | undefined {
  const query: ConnectorQuery = {
    amount: 10,
    fields: ["id", "name", "networks", "public", "device_parameters"],
  };

  if ("public" in queryObj) {
    query.filter = {
      public: queryObj.public,
    };
  }

  if (queryObj.name) {
    query.filter = {
      name: `*${queryObj.name}*`,
    };
  }

  return query;
}

function isValidId(value: string): boolean {
  return value?.length === 24;
}

async function lookupNetwork(resources: Resources, queryObj: IntegrationQuery): Promise<string> {
  if (queryObj.id && isValidId(queryObj.id)) {
    const result = await resources.integration.networks.info(queryObj.id);
    return convertJSONToMarkdown(result);
  }

  const validatedQuery = validateNetworkQuery(queryObj);
  const networks = await resources.integration.networks.list(validatedQuery).catch((error) => {
    throw `**Error fetching networks:** ${(error as Error)?.message || error}`;
  });
  return convertJSONToMarkdown(networks);
}

async function lookupConnector(resources: Resources, queryObj: IntegrationQuery): Promise<string> {
  if (queryObj.id && isValidId(queryObj.id)) {
    const result = await resources.integration.connectors.info(queryObj.id);
    return convertJSONToMarkdown(result);
  }

  const validatedQuery = validateConnectorQuery(queryObj);
  const connectors = await resources.integration.connectors.list(validatedQuery).catch((error) => {
    throw `**Error fetching connectors:** ${(error as Error)?.message || error}`;
  });
  return convertJSONToMarkdown(connectors);
}

/**
 * @description Fetches connectors and networks from the account and returns a Markdown-formatted response.
 */
async function integrationOperationsTool(resources: Resources, params: IntegrationSchema) {
  const validatedParams = integrationBaseSchema.parse(params);
  const { query } = validatedParams;

  const results: string[] = [];

  // Process each query object in the array
  for (const queryObj of query) {
    if (queryObj.type === "connector") {
      const connectorResult = await lookupConnector(resources, queryObj);
      results.push(`## Connector Results\n\n${connectorResult}`);
    } else if (queryObj.type === "network") {
      const networkResult = await lookupNetwork(resources, queryObj);
      results.push(`## Network Results\n\n${networkResult}`);
    }
  }

  return results.join("\n\n");
}

const integrationLookupConfigJSON: IDeviceToolConfig = {
  name: "connector-network-lookup",
  description: `The ConnectorNetworkLookup tool retrieves connector and network information from the TagoIO platform using either ID or name-based searches. This tool queries the TagoIO database to find specific connectors (pre-defined data decoders) and networks (communication protocol or integrations) that facilitate device connectivity and data transmission within the IoT platform.
  
The query parameter accepts an array of query objects. Each object must specify a "type" (connector or network) and either an "id" or "name" for lookup. The "public" field can optionally filter results by privacy status. You can query multiple resources in a single request by providing multiple objects in the array.

Do not use this tool for uploading payload parser code, accessing or fetching Network/Connector payload parser code, or any code modification operations. When users request code upload or retrieval for payload parsers, inform them that you can provide code assistance and guidance but cannot directly upload or fetch code through this tool. 

When looking up a list of connectors or networks, ALWAYS inform the user that the results will return a maximum of 10.

<example>
  {
    "query": [
      {
        "type": "connector",
        "name": "HTTP",
        "public": false
      },
      {
        "type": "network", 
        "id": "62336c32ab6e0d0012e06c04"
      }
    ]
  }
</example>`,
  parameters: integrationBaseSchema.shape,
  title: "Connector Network Lookup",
  tool: integrationOperationsTool,
};

export { integrationLookupConfigJSON };
export { integrationBaseSchema }; // export for testing purposes
