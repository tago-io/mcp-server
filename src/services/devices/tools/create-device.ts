import type { DeviceCreateInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { resourceIdSchema, tagsObjectModel } from "../../../utils/global-params.model";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { invalidParamError } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";

const configParamSchema = z.object({
  id: z.string().describe("Existing parameter ID (update). Omit to create a new parameter.").optional(),
  sent: z.boolean().describe("Whether the parameter was already sent to the device."),
  key: z.string().describe("Parameter key."),
  value: z.string().describe("Parameter value."),
});

const createDeviceSchema = {
  name: z.string().min(1).describe("The device name."),
  connector: resourceIdSchema("connector ID").describe("The connector ID (required, find one with search_connectors)."),
  network: z
    .string()
    .length(24, "Network ID must be 24 characters long")
    .describe("The network ID. Optional: when omitted it is derived from the connector if the connector supports exactly one network. Find candidates with search_networks.")
    .optional(),
  type: z.enum(["mutable", "immutable"]).describe("Data storage type. Defaults to 'mutable'. Cannot be changed after creation.").optional(),
  chunk_period: z.enum(["day", "week", "month", "quarter"]).describe("Data chunk period. Required for immutable devices.").optional(),
  chunk_retention: z.number().int().min(0).max(36500).describe("How many chunk periods to retain data. Required for immutable devices.").optional(),
  tags: z.array(tagsObjectModel).describe("Tags. E.g: [{ key: 'device_type', value: 'sensor' }]").optional(),
  description: z.string().describe("Device description.").optional(),
  active: z.boolean().describe("Active status (default true).").optional(),
  serie_number: z.string().describe("Serial number (EUI, MQTT client ID, or IMEI).").optional(),
  payload_decoder: z.string().describe("Payload parser JavaScript source. Sent base64-encoded automatically.").optional(),
  configuration_params: z.array(configParamSchema).describe("Configuration parameters to set after creation.").optional(),
};

type CreateDeviceParams = z.infer<z.ZodObject<typeof createDeviceSchema>>;

/**
 * Resolves the network for the device against the connector's supported
 * networks. Contract: validate a supplied network's membership; derive
 * only when unambiguous; never silently pick the first of several.
 */
async function resolveNetwork(context: ServerContext, connectorId: string, suppliedNetwork: string | undefined): Promise<string> {
  const connector = await context.resources.integration.connectors.info(connectorId, ["id", "name", "networks"]);
  const networks = (connector.networks ?? []) as string[];

  if (networks.length === 0) {
    throw new Error(
      `Connector "${connector.name}" (${connectorId}) has no compatible networks, so no device can be created with it. Pick a different connector with search_connectors.`
    );
  }

  if (suppliedNetwork) {
    if (!networks.includes(suppliedNetwork)) {
      throw new Error(
        `Network ${suppliedNetwork} does not belong to connector "${connector.name}" (${connectorId}). Compatible networks: ${networks.join(", ")}. Use search_networks to inspect them.`
      );
    }
    return suppliedNetwork;
  }

  if (networks.length === 1) {
    return networks[0];
  }

  throw new Error(
    `Connector "${connector.name}" (${connectorId}) supports ${networks.length} networks and none was specified: ${networks.join(", ")}. Pass one as \`network\`; use search_networks or get_network to compare them.`
  );
}

async function createDeviceTool(context: ServerContext, params: CreateDeviceParams): Promise<string> {
  const type = params.type ?? "mutable";

  if (type === "immutable") {
    if (!params.chunk_period) {
      throw invalidParamError("chunk_period", "required for immutable devices", '"month"');
    }
    if (params.chunk_retention === undefined) {
      throw invalidParamError("chunk_retention", "required for immutable devices", "12");
    }
  }

  const network = await resolveNetwork(context, params.connector, params.network);

  const { configuration_params, payload_decoder, ...deviceFields } = params;
  const createInfo = {
    ...deviceFields,
    type,
    network,
    ...(payload_decoder ? { payload_decoder: Buffer.from(payload_decoder).toString("base64") } : {}),
  } as DeviceCreateInfo;

  const result = await context.resources.devices.create(createInfo);

  let configurationError: string | undefined;
  if (configuration_params && configuration_params.length > 0) {
    await context.resources.devices
      .paramSet(
        result.device_id,
        configuration_params.map((param) => ({ sent: param.sent, key: param.key, value: param.value }))
      )
      .catch((error) => {
        configurationError = (error as Error)?.message || String(error);
      });
  }

  return convertJSONToMarkdown({
    device_id: result.device_id,
    token: result.token,
    connector: params.connector,
    network,
    type,
    ...(configurationError ? { configuration_error: `Device created, but setting configuration parameters failed: ${configurationError}` } : {}),
  });
}

const createDeviceConfigJSON: IToolConfig = {
  name: "create_device",
  description: `Creates a new device on the connector you specify. There are no default connectors or networks: pick the connector explicitly (search_connectors) and, when it supports several networks, pick the network too (search_networks).

Use when provisioning a new IoT endpoint. The storage type (mutable/immutable) is permanent; immutable devices additionally require chunk_period and chunk_retention. Returns the new device ID and its device token; treat the token as a secret.

<example>
{"name": "Warehouse Tracker", "connector": "61f0000000000000000c0001", "type": "mutable", "tags": [{"key": "device_type", "value": "tracker"}]}
</example>`,
  parameters: createDeviceSchema,
  title: "Create Device",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: createDeviceTool,
};

export { createDeviceConfigJSON };
