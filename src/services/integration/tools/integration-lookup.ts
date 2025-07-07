import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { NetworkQuery } from "@tago-io/sdk/lib/modules/Resources/integration.networks.types";
import { ConnectorQuery } from "@tago-io/sdk/lib/modules/Resources/integration.connectors.types";

// Base schema without refinement - this provides the .shape property needed by MCP
const integrationBaseSchema = z.object({
  operation: z.enum(["lookup"]).describe("The type of operation to perform on the integration."),
  query: z.object({
    connector: z.string().describe("The ID or name of the connector to perform the operation on. Optional for lookup and create, but required for update and delete operations.").optional(),
    network: z.string().describe("The ID or name of the network to perform the operation on. Optional for lookup and create, but required for update and delete operations.").optional(),
  }).describe("The query to perform the operation on."),
}).describe("Schema for the integration operation.");

//TODO: add refine for create and update operations
const integrationSchema = integrationBaseSchema.refine(() => {
  // list and info operations are valid with or without query
  return true;
}, {
  message: "Invalid data structure for the specified operation. Create requires createNetwork, update requires updateNetwork.",
});

type IntegrationSchema = z.infer<typeof integrationSchema>;

function validateNetworkQuery(networkName: string): NetworkQuery | undefined {
  if (!networkName) {
    return undefined;
  };

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
  };

  return {
    amount: 200,
    fields: ["id", "name", "networks"],
    filter: {
      name: `*${connectorName}*`,
    },
  };
}

interface IntegrationOperationHandler {
  lookup(params: IntegrationSchema): Promise<string>;
}

function createNetworkIntegrationHandler(resources: Resources): IntegrationOperationHandler {
  const getNetworkInfo = async (networkID: string): Promise<string> => {
    const result = await resources.integration.networks.info(networkID);
    return convertJSONToMarkdown(result);
  };

  const listNetworks = async (networkName: string): Promise<string> => {
    const validatedQuery = validateNetworkQuery(networkName);
    const networks = await resources.integration.networks
      .list(validatedQuery)
      .catch((error) => {
        throw `**Error fetching networks:** ${(error as Error)?.message || error}`;
      });
    return convertJSONToMarkdown(networks);
  };

  return {
    async lookup(params: IntegrationSchema): Promise<string> {
      const { query } = params;
      const { network } = query;

      const isNetworkID = network?.length === 24;
      
      return isNetworkID 
        ? getNetworkInfo(network)
        : listNetworks(network as string);
    }
  };
}

function createConnectorIntegrationHandler(resources: Resources): IntegrationOperationHandler {
  const getConnectorInfo = async (connectorID: string): Promise<string> => {
    const result = await resources.integration.connectors.info(connectorID);
    return convertJSONToMarkdown(result);
  };

  const listConnectors = async (connectorName: string): Promise<string> => {
    const validatedQuery = validateConnectorQuery(connectorName);
    const connectors = await resources.integration.connectors
      .list(validatedQuery)
      .catch((error) => {
        throw `**Error fetching connectors:** ${(error as Error)?.message || error}`;
      });
    return convertJSONToMarkdown(connectors);
  };

  return {
    async lookup(params: IntegrationSchema): Promise<string> {
      const { query } = params;
      const { connector } = query;
      
      const isConnectorID = connector?.length === 24;
      
      return isConnectorID 
        ? getConnectorInfo(connector)
        : listConnectors(connector as string);
    }
  };
}

function createIntegrationHandler(query: IntegrationSchema["query"], resources: Resources): IntegrationOperationHandler {
  const handlers = {
    network: () => createNetworkIntegrationHandler(resources),
    connector: () => createConnectorIntegrationHandler(resources)
  };

  // If network query exists, use network handler, otherwise use connector handler
  const handlerType = query.network ? 'network' : 'connector';
  const handler = handlers[handlerType];
  if (!handler) {
    throw new Error(`Unsupported integration type: ${handlerType}`);
  }
  
  return handler();
}

const integrationOperationExecutors = {
  lookup: async (handler: IntegrationOperationHandler, params: IntegrationSchema) => {
    return handler.lookup(params);
  }
} as const;

/**
 * @description Fetches entities from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function integrationOperationsTool(resources: Resources, params: IntegrationSchema) {
  const validatedParams = integrationSchema.parse(params);
  const { operation, query } = validatedParams;

  const handler = createIntegrationHandler(query, resources);
  
  return integrationOperationExecutors[operation](handler, validatedParams);
}

const integrationLookupConfigJSON: IDeviceToolConfig = {
  name: "integration-operations",
  description: `Perform operations on connectors and networks. It can be used to create, update, list and delete networks and connectors.
  
  <example>
    {
      "operation": "lookup",
      "query": {
        "connector": "id-or-name",
        "network": "id-or-name"
      }
    }
  </example>

  `,
  parameters: integrationBaseSchema.shape,
  title: "Integration Operations",
  tool: integrationOperationsTool,
};

export { integrationLookupConfigJSON };
export { integrationBaseSchema }; // export for testing purposes
