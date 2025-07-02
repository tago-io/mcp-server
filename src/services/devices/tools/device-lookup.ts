import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { ConfigurationParams, DeviceCreateInfo, DeviceEditInfo, DeviceListItem, DeviceQuery, ListDeviceTokenQuery, TokenData } from "@tago-io/sdk/lib/types";
import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema, tagsObjectModel } from "../../../utils/global-params.model";

const configParamSchema = z.object({
  id: z.string().describe("The ID of the configuration parameter.").optional(),
  sent: z.boolean().describe("The sent status of the configuration parameter."),
  key: z.string().describe("The key of the configuration parameter."),
  value: z.string().describe("The value of the configuration parameter."),
}).describe("The configuration parameter of the device.");

const deviceLookupSchema = querySchema.extend({
  filter: z
    .object({
      id: z.string().describe("Filter by device ID. E.g: 'device_id'").length(24, "Device ID must be 24 characters long").optional(),
      name: z
        .string()
        .describe(`
          The name filter uses wildcard matching, so do not need to specify the exact device name.
          For example, searching for "sensor" finds devices like "Temperature Sensor" and "Humidity Sensor".
        `)
        .transform((val) => `*${val}*`)
        .optional(),
      active: z.boolean().describe("Filter by active status. E.g: true").optional(),
      connector: z.string().describe("Filter by connector ID. E.g: 'connector_id'").length(24, "Connector ID must be 24 characters long").optional(),
      network: z.string().describe("Filter by network ID. E.g: 'network_id'").length(24, "Network ID must be 24 characters long").optional(),
      type: z.enum(["mutable", "immutable"]).describe("Filter by device type. E.g: 'mutable' or 'immutable'").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'device_type', value: 'sensor' }]").optional(),
    })
    .describe("Filter object to apply to the query. Available filters: id, name, active, connector, network, type, tags")
    .optional(),
  fields: z
    .array(z.enum(["id", "active", "name", "tags", "created_at", "updated_at", "connector", "network", "type"]))
    .describe("Specific fields to include in the device list response. Available fields: id, active, name, tags, created_at, updated_at, connector, network, type")
    .optional(),
  include_data_amount: z
    .boolean()
    .describe("If true, includes the amount of data for each device in the response. This option is only available when filtering by a single device. Default: false.")
    .optional(),
}).describe("The device to be listed. Required for lookup operations.");

const deviceCreateSchema = z.object({
  name: z.string().describe("The name of the device."),
  connector: z.string().describe(`The connector ID of the device. 
    If given a name you can search a connector by using the connector-lookup operation.
    If not given the ID or name use the default connector ID.
    If has been given connector name or ID and network name or ID, the network ID must be same as the connector network ID.
    If network ID or name is not given, the network ID will be the same as the connector network ID.
    Default: 62333bd36977fc001a2990c8
  `).default("62333bd36977fc001a2990c8"),
  network: z.string().describe(`The network ID of the device. 
    If given a name you can search a network by using the network-lookup operation.
    If not given the ID or name use the default network ID.
    If has been given connector name or ID and network name or ID, the network ID must be same as the connector network ID.
    If network ID or name is not given, the network ID will be the same as the connector network ID.
    Default: 62336c32ab6e0d0012e06c04
  `).default("62336c32ab6e0d0012e06c04"),
  type: z.enum(["mutable", "immutable"]).describe("The type of data storage of the device. When not given, the type will be mutable."),
  tags: z.array(tagsObjectModel).describe("The tags for the device. E.g: [{ key: 'device_type', value: 'sensor' }]").optional(),
  description: z.string().describe("The description of the device.").optional(),
  active: z.boolean().describe("The active status of the device. When not given, the active status will be true.").optional(),
  visible: z.boolean().describe("The visible status of the device. When not given, the visible status will be true.").optional(),
  configuration_params: z.array(configParamSchema).describe("The configuration parameters of the device. E.g: [{ key: 'dashboard_url', value: 'https://admin.tago.io', sent: true }]").optional(),
  connector_parse: z.boolean().describe("Will define if the device will use the connector parser").optional(),
  serie_number: z.string().describe("The serial number of the device.").optional(),
  chunk_period: z.enum(["day", "week", "month", "quarter"]).describe("The chunk period of the device. This defines the period of time for the data to be stored in the database. Required for immutable devices.").optional(),
  chunk_retention: z.number().describe("The chunk retention of the device. This defines the number of days, weeks, months or quarters to keep the data in the database. Required for immutable devices.").optional(),
  payload_decoder: z.string().describe("The payload parser of the device. This is a javascript code that will be used to decode the payload of the device. This must be a valid javascript code.").optional(),
}).describe("The device to be created. Required for create operations.");

const deviceUpdateSchema = deviceCreateSchema.partial().describe("Schema for the device update operation.").optional()
  .describe("Schema for the device update operation.");

const parameterListSchema = z.object({
  sentStatus: z.boolean().describe("The sent status of the configuration parameters. If true, only returns the configuration parameters that have been sent. If false, returns configuration parameters that have not been sent.").optional(),
}).describe("The device to get the configuration parameters from. Required for parameter-list operations.").optional();

const parameterSetSchema = z.object({
  configObj: z.array(configParamSchema).describe("The configuration parameters to set. E.g: [{ key: 'dashboard_url', value: 'https://admin.tago.io', sent: true }]").optional(),
}).describe("The device to set the configuration parameters from. Required for parameter-set operations.").optional();

const parameterRemoveSchema = z.object({
  paramID: z.string().describe("The ID of the configuration parameter to remove. Required for parameter-remove operations."),
}).describe("The device to remove the configuration parameters from. Required for parameter-remove operations.").optional();

const tokenListSchema = querySchema.extend({
  filter: z
    .object({
      name: z
        .string()
        .describe(`
          The name filter uses wildcard matching, so do not need to specify the exact token name.
          For example, searching for "sensor" finds tokens like "Temperature Sensor" and "Humidity Sensor".
        `)
        .transform((val) => `*${val}*`)
        .optional(),
      serie_number: z.string().describe("Filter by token serie number. E.g: '123456'").optional(),
      permission: z.enum(["full"]).describe("Filter by token permission. E.g: 'full'").optional(),
    })
    .describe("Filter object to apply to the query. Available filters: name, serie_number, permission")
    .optional(),
  fields: z
    .array(z.enum(["id", "name", "token", "serie_number", "permission", "created_at"]))
    .describe("Specific fields to include in the token list response. Available fields: id, name, token, serie_number, permission, created_at")
    .optional(),
}).describe("The token to be listed. Optional for token-list operations.");

const tokenCreateSchema = z.object({
  name: z.string().describe("The name of the token."),
  permission: z.enum(["full"]).describe("The permission of the token. E.g: 'full'").optional(),
  serie_number: z.string().describe("The serial number of the token.").optional(),
}).describe("The token to be created. Required for token-create operations.");

const tokenDeleteSchema = z.object({
  token: z.string().describe("The token to delete. Required for token-delete operations."),
}).describe("The token to delete. Required for token-delete operations.").optional();

type DeviceWithDataAmount = DeviceListItem & { data_amount?: number };

const deviceBaseSchema = z.object({
  operation: z.enum(["lookup", "delete", "create", "update", "parameter-list", "parameter-set", "parameter-remove", "token-list", "token-create", "token-delete"])
  .describe(`The type of operation to perform on the device.
    lookup: Get the information of a device by its ID or a list of devices by a query.
    delete: Delete a device by its ID.
    create: Create a new device.
    update: Update a device by its ID.
    parameter-list: Get a list of the configuration parameters of a device by its ID.
    parameter-set: Set the configuration parameters of a device by its ID.
    parameter-remove: Remove a configuration parameter of a device by its ID.
    token-list: Get a list of the tokens of a device by its ID.
    token-create: Create a new token for a device by its ID.
    token-delete: Delete a token by its token.
  `),
  deviceID: z.string().describe("The ID of the Device to perform the operation on. Optional for lookup and create, but required for update, delete and parameter-list operations.").optional(),
  // Separate fields for different operations to maintain type safety
  lookupDevice: deviceLookupSchema.describe("The device to be listed. Required for lookup operations.").optional(),
  createDevice: deviceCreateSchema.describe("The device to be created. Required for create operations.").optional(),
  updateDevice: deviceUpdateSchema.describe("The device to be updated. Required for update operations.").optional(),
  parameterListDevice: parameterListSchema.describe("The device to get the configuration parameters from. Required for parameter-list operations.").optional(),
  parameterSetDevice: parameterSetSchema.describe(`The device to set the configuration parameters from. 
    Required for parameter-set operations.
    To create a new configuration parameter, you need to get all the configuration parameters of the device and add the new parameter to the array.
    To edit an existing configuration parameter, you need to get all the configuration parameters of the device and edit the parameter in the array.
  `).optional(),
  parameterRemoveDevice: parameterRemoveSchema.describe(`The device to remove the configuration parameters from. Required for parameter-remove operations.
    If the parameter ID is not given, you need to get all the configuration parameters of the device and get the ID of the parameter to remove by key.
  `).optional(),
  tokenListDevice: tokenListSchema.describe("The device to get the tokens from. Required for token-list operations.").optional(),
  tokenCreateDevice: tokenCreateSchema.describe("The device to create a new token from. Required for token-create operations.").optional(),
  tokenDeleteDevice: tokenDeleteSchema.describe("The device to delete a token from. Required for token-delete operations.").optional(),
}).describe("Schema for the device operation. The delete operation only requires the deviceID.");

const deviceSchema = deviceBaseSchema.refine((data) => {
  // Validation for create operation
  if (data.operation === "create") {
    return !!data.createDevice;
  }

  // Validation for update operation
  if (data.operation === "update") {
    return !!data.updateDevice;
  }

  // Validation for token-create operation
  if (data.operation === "token-create") {
    return !!data.tokenCreateDevice;
  }

  // list and info operations are valid with or without query
  return true;
}, {
  message: "Invalid data structure for the specified operation. Create requires createDevice, update requires updateDevice, token-create requires tokenCreateDevice.",
});

type DeviceSchema = z.infer<typeof deviceSchema>;

function validateDeviceQuery(query: any): DeviceQuery | undefined {
  if (!query) {
    return undefined;
  };

  const amount = query.amount || 200;
  const fields = query.fields || ["id", "active", "name", "created_at", "updated_at", "connector", "network", "type"];

  return {
    amount,
    fields,
    ...query,
  };
}

function validateTokenListQuery(query: any): ListDeviceTokenQuery | undefined {
  if (!query) {
    return undefined;
  };

  const amount = query.amount || 200;
  const fields = query.fields || ["name", "token", "serie_number", "permission"];

  return {
    amount,
    fields,
    ...query,
  };
}

/**
 * @description Get all devices and returns a Markdown-formatted response.
 */
async function deviceOperationsTool(resources: Resources, params: DeviceSchema) {
  const validatedParams = deviceSchema.parse(params);
  const { operation, deviceID } = validatedParams;

  switch (operation) {
    case "lookup": {
      if (deviceID) {
        const result = await resources.devices.info(deviceID as string);
        const markdownResponse = convertJSONToMarkdown(result);
        return markdownResponse;
      }
      const validatedQuery = validateDeviceQuery(validatedParams.lookupDevice);
      const devices = await resources.devices
        .list(validatedQuery)
        .catch((error) => {
          throw `**Error fetching devices:** ${(error as Error)?.message || error}`;
        });
        let devicesWithDataAmount: DeviceWithDataAmount[] = devices;

        if (validatedParams.lookupDevice?.include_data_amount && devices.length === 1) {
          const dataAmount = await resources.devices.amount(devices[0].id);
          devicesWithDataAmount = [{ ...devices[0], data_amount: dataAmount }];
        } else if (validatedParams.lookupDevice?.include_data_amount && devices.length !== 1) {
          throw "The 'include_data_amount' option is only available when filtering by a single device.";
        }
        const markdownResponse = convertJSONToMarkdown(devicesWithDataAmount);
        return markdownResponse;
    }
    case "create": {
      const result = await resources.devices.create(validatedParams.createDevice as DeviceCreateInfo);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
    case "update": {
      if (validatedParams.updateDevice?.payload_decoder) {
        validatedParams.updateDevice.payload_decoder = Buffer.from(validatedParams.updateDevice.payload_decoder).toString("base64");
      }

      let tokenObject;
      if (validatedParams.updateDevice?.network || validatedParams.updateDevice?.connector) {
        [tokenObject] = await resources.devices.tokenList(deviceID as string);
        await resources.devices.tokenDelete(tokenObject.token);
      }
      const result = await resources.devices.edit(deviceID as string, validatedParams.updateDevice as DeviceEditInfo);
      const markdownResponse = convertJSONToMarkdown(result);

      if (tokenObject) {
        await resources.devices.tokenCreate(deviceID as string, {
          name: tokenObject.name || "Default",
          permission: tokenObject.permission || "full",
          serie_number: tokenObject.serie_number || undefined,
        });
      }

      return markdownResponse;
    }
    case "delete": {
      const result = await resources.devices.delete(deviceID as string);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
    case "parameter-list": {
      if (validatedParams.parameterListDevice) {
        const result = await resources.devices.paramList(deviceID as string, validatedParams.parameterListDevice?.sentStatus);
        const markdownResponse = convertJSONToMarkdown(result);
        return markdownResponse;
      }
      const result = await resources.devices.paramList(deviceID as string);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
    case "parameter-set": {
      const result = await resources.devices.paramSet(deviceID as string, validatedParams.parameterSetDevice?.configObj as Partial<ConfigurationParams>[]);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
    case "parameter-remove": {
      const result = await resources.devices.paramRemove(deviceID as string, validatedParams.parameterRemoveDevice?.paramID as string);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
    case "token-list": {
      const validatedQuery = validateTokenListQuery(validatedParams.tokenListDevice);
      const result = await resources.devices.tokenList(deviceID as string, validatedQuery);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
    case "token-create": {
      const result = await resources.devices.tokenCreate(deviceID as string, validatedParams.tokenCreateDevice as TokenData);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
    case "token-delete": {
      const result = await resources.devices.tokenDelete(validatedParams.tokenDeleteDevice?.token as string);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
  }
}

const deviceLookupConfigJSON: IDeviceToolConfig = {
  name: "device-operations",
  description: `Perform operations on devices. It can be used to list, create, update and delete devices.
  
  <example>
    {
      "operation": "list",
      "device": {
        "name": "My Device",
        "type": "mutable",
        "tags": [{ "key": "device_type", "value": "sensor" }],
        "fields": ["id", "active", "name", "created_at", "updated_at", "connector", "network", "type"],
        "filter": {
          "name": "My Device",
          "tags": [{ "key": "device_type", "value": "sensor" }]
        }
      }
    }
  </example>

  `,
  parameters: deviceBaseSchema.shape,
  title: "Device Operations",
  tool: deviceOperationsTool,
};

export { deviceLookupConfigJSON };
export { deviceBaseSchema }; // export for testing purposes
export { deviceSchema }; // export for testing purposes
