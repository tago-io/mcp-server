import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { NetworkQuery } from "@tago-io/sdk/lib/modules/Resources/integration.networks.types";
import { ConnectorQuery } from "@tago-io/sdk/lib/modules/Resources/integration.connectors.types";

// Base schema without refinement - this provides the .shape property needed by MCP
const integrationBaseSchema = z
  .object({
    query: z
      .object({
        connector: z
          .string()
          .describe("The ID or name of the connector to perform the operation on. Optional for lookup and create, but required for update and delete operations.")
          .optional(),
        network: z
          .string()
          .describe("The ID or name of the network to perform the operation on. Optional for lookup and create, but required for update and delete operations.")
          .optional(),
      })
      .describe("The query to perform the operation on."),
  })
  .describe("Schema for the integration operation.");

const integrationSchema = integrationBaseSchema.refine(
  (data) => {
    // At least one of connector or network must be provided
    return data.query.connector || data.query.network;
  },
  {
    message: "At least one of 'connector' or 'network' must be provided in the query.",
  }
);

type IntegrationSchema = z.infer<typeof integrationSchema>;

function validateNetworkQuery(networkName: string): NetworkQuery | undefined {
  if (!networkName) {
    return undefined;
  }

  return {
    amount: 200,
    fields: ["id", "name"],
    filter: {
      name: `*${networkName}*`,
    },
  };
}

function validateConnectorQuery(connectorName: string): ConnectorQuery | undefined {
  if (!connectorName) {
    return undefined;
  }

  return {
    amount: 200,
    fields: ["id", "name", "networks"],
    filter: {
      name: `*${connectorName}*`,
    },
  };
}

function isValidId(value: string): boolean {
  return value?.length === 24;
}

async function lookupNetwork(resources: Resources, network: string): Promise<string> {
  if (isValidId(network)) {
    const result = await resources.integration.networks.info(network);
    return convertJSONToMarkdown(result);
  }

  const validatedQuery = validateNetworkQuery(network);
  const networks = await resources.integration.networks.list(validatedQuery).catch((error) => {
    throw `**Error fetching networks:** ${(error as Error)?.message || error}`;
  });
  return convertJSONToMarkdown(networks);
}

async function lookupConnector(resources: Resources, connector: string): Promise<string> {
  if (isValidId(connector)) {
    const result = await resources.integration.connectors.info(connector);
    return convertJSONToMarkdown(result);
  }

  const validatedQuery = validateConnectorQuery(connector);
  const connectors = await resources.integration.connectors.list(validatedQuery).catch((error) => {
    throw `**Error fetching connectors:** ${(error as Error)?.message || error}`;
  });
  return convertJSONToMarkdown(connectors);
}

/**
 * @description Fetches connectors and networks from the account and returns a Markdown-formatted response.
 */
async function integrationOperationsTool(resources: Resources, params: IntegrationSchema) {
  const validatedParams = integrationSchema.parse(params);
  const { query } = validatedParams;

  const results: string[] = [];

  // Look up connector if provided
  if (query.connector) {
    const connectorResult = await lookupConnector(resources, query.connector);
    results.push(`## Connector Results\n\n${connectorResult}`);
  }

  // Look up network if provided
  if (query.network) {
    const networkResult = await lookupNetwork(resources, query.network);
    results.push(`## Network Results\n\n${networkResult}`);
  }

  return results.join("\n\n");
}

const integrationLookupConfigJSON: IDeviceToolConfig = {
  name: "connector-network-lookup",
  description: `The ConnectorNetworkLookup tool retrieves connector and network information from the TagoIO platform using either ID or name-based searches. This tool queries the TagoIO database to find specific connectors (data integration endpoints) and networks (communication pathways) that facilitate device connectivity and data transmission within the IoT platform.
  
The query object accepts two optional fields: "connector" and "network", each accepting either the exact resource ID (alphanumeric string) or a full or partial resource name (case-sensitive string). You can query for a connector only, a network only, or both simultaneously in a single request. When using partial names, the tool will return all matching resources that contain the specified text.

<example>
  {
    "query": {
      "connector": "id-or-name",
      "network": "id-or-name"
    }
  }
</example>`,
  parameters: integrationBaseSchema.shape,
  title: "Connector Network Lookup",
  tool: integrationOperationsTool,
};

export { integrationLookupConfigJSON };
export { integrationBaseSchema }; // export for testing purposes
