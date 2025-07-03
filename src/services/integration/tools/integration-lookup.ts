import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema } from "../../../utils/global-params.model";
import { NetworkQuery } from "@tago-io/sdk/lib/modules/Resources/integration.networks.types";
import { ConnectorQuery } from "@tago-io/sdk/lib/modules/Resources/integration.connectors.types";

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
const integrationBaseSchema = z.object({
  operation: z.enum(["lookup"]).describe("The type of operation to perform on the network."),
  integrationType: z.enum(["network", "connector"]).describe("The type of integration to perform the operation on."),
  networkID: z.string().describe("The ID of the network to perform the operation on. Optional for lookup and create, but required for update and delete operations.").optional(),
  connectorID: z.string().describe("The ID of the connector to perform the operation on. Optional for lookup and create, but required for update and delete operations.").optional(),
  // Separate fields for different operations to maintain type safety
  lookupNetwork: networkListSchema.describe("The network to be listed. Required for lookup operations.").optional(),
  lookupConnector: connectorListSchema.describe("The connector to be listed. Required for lookup operations.").optional(),
}).describe("Schema for the network operation. The delete operation only requires the networkID.");

//TODO: add refine for create and update operations
const integrationSchema = integrationBaseSchema.refine(() => {
  // list and info operations are valid with or without query
  return true;
}, {
  message: "Invalid data structure for the specified operation. Create requires createNetwork, update requires updateNetwork.",
});

type IntegrationSchema = z.infer<typeof integrationSchema>;

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

interface IntegrationOperationHandler {
  lookup(params: IntegrationSchema): Promise<string>;
}

class NetworkIntegrationHandler implements IntegrationOperationHandler {
  constructor(private resources: Resources) {}

  async lookup(params: IntegrationSchema): Promise<string> {
    const { networkID, lookupNetwork } = params;
    
    return networkID 
      ? this.getNetworkInfo(networkID)
      : this.listNetworks(lookupNetwork);
  }

  private async getNetworkInfo(networkID: string): Promise<string> {
    const result = await this.resources.integration.networks.info(networkID);
    return convertJSONToMarkdown(result);
  }

  private async listNetworks(lookupNetwork: any): Promise<string> {
    const validatedQuery = validateNetworkQuery(lookupNetwork);
    const networks = await this.resources.integration.networks
      .list(validatedQuery)
      .catch((error) => {
        throw `**Error fetching networks:** ${(error as Error)?.message || error}`;
      });
    return convertJSONToMarkdown(networks);
  }
}

class ConnectorIntegrationHandler implements IntegrationOperationHandler {
  constructor(private resources: Resources) {}

  async lookup(params: IntegrationSchema): Promise<string> {
    const { connectorID, lookupConnector } = params;
    
    return connectorID 
      ? this.getConnectorInfo(connectorID)
      : this.listConnectors(lookupConnector);
  }

  private async getConnectorInfo(connectorID: string): Promise<string> {
    const result = await this.resources.integration.connectors.info(connectorID);
    return convertJSONToMarkdown(result);
  }

  private async listConnectors(lookupConnector: any): Promise<string> {
    const validatedQuery = validateConnectorQuery(lookupConnector);
    const connectors = await this.resources.integration.connectors
      .list(validatedQuery)
      .catch((error) => {
        throw `**Error fetching connectors:** ${(error as Error)?.message || error}`;
      });
    return convertJSONToMarkdown(connectors);
  }
}

class IntegrationHandlerFactory {
  static create(integrationType: string, resources: Resources): IntegrationOperationHandler {
    const handlers = {
      network: () => new NetworkIntegrationHandler(resources),
      connector: () => new ConnectorIntegrationHandler(resources)
    };

    const handler = handlers[integrationType as keyof typeof handlers];
    if (!handler) {
      throw new Error(`Unsupported integration type: ${integrationType}`);
    }
    
    return handler();
  }
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
  const { operation, integrationType } = validatedParams;

  const handler = IntegrationHandlerFactory.create(integrationType, resources);
  
  return integrationOperationExecutors[operation](handler, validatedParams);
}

const integrationLookupConfigJSON: IDeviceToolConfig = {
  name: "integration-operations",
  description: `Perform operations on connectors and networks. It can be used to create, update, list and delete networks and connectors.
  
  <example>
    {
      "operation": "lookup",
      "integrationType": "network",
      "networkID": "123456789012345678901234",
      "lookupNetwork": {
        "amount": 100,
        "fields": ["id", "name", "description", "device_parameters", "public", "created_at", "updated_at"],
        "filter": {
          "name": "sensor",
        }
      }
    }
  </example>
  <example>
    {
      "operation": "lookup",
      "integrationType": "connector",
      "connectorID": "123456789012345678901234",
      "lookupConnector": {
        "amount": 100,
        "fields": ["id", "name", "description", "networks"],
        "filter": {
          "name": "sensor",
        }
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
