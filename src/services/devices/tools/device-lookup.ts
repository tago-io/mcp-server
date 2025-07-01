import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { DeviceCreateInfo, DeviceEditInfo, DeviceListItem, DeviceQuery } from "@tago-io/sdk/lib/types";
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
});

const deviceCreateSchema = z.object({
  name: z.string().describe("The name of the device."),
  connector: z.string().describe(`The connector ID of the device. 
    If given a name you can search a connector by using the connector-lookup operation.
    If not given the ID or name use the default connector ID.
    Default: 62333bd36977fc001a2990c8
  `).default("62333bd36977fc001a2990c8"),
  network: z.string().describe(`The network ID of the device. 
    If given a name you can search a network by using the network-lookup operation.
    If not given the ID or name use the default network ID.
    Default: 62336c32ab6e0d0012e06c04
  `).default("62336c32ab6e0d0012e06c04"),
  type: z.enum(["mutable", "immutable"]).describe("The type of data storage of the device."),
  tags: z.array(tagsObjectModel).describe("The tags for the device. E.g: [{ key: 'device_type', value: 'sensor' }]").optional(),
  description: z.string().describe("The description of the device.").optional(),
  active: z.boolean().describe("The active status of the device.").optional(),
  visible: z.boolean().describe("The visible status of the device.").optional(),
  configuration_params: z.array(configParamSchema).describe("The configuration parameters of the device. E.g: [{ key: 'dashboard_url', value: 'https://admin.tago.io' }]").optional(),
  parse_function: z.string().describe("The parse function of the device.").optional(),
  connector_parse: z.boolean().describe("The connector parse status of the device.").optional(),
  serie_number: z.string().describe("The serial number of the device.").optional(),
  chunk_period: z.enum(["day", "week", "month", "quarter"]).describe("The chunk period of the device. This defines the period of time for the data to be stored in the database. Required for immutable devices.").optional(),
  chunk_retention: z.number().describe("The chunk retention of the device. This defines the number of days, weeks, months or quarters to keep the data in the database. Required for immutable devices.").optional(),
});

const deviceUpdateSchema = deviceCreateSchema.partial().describe("Schema for the device update operation.").optional()
  .describe("Schema for the device update operation.");

type DeviceWithDataAmount = DeviceListItem & { data_amount?: number };

const deviceBaseSchema = z.object({
  operation: z.enum(["lookup", "delete", "create", "update", "parameter-list"]).describe(`The type of operation to perform on the device.
    lookup: Get the information of a device by its ID or a list of devices by a query.
    delete: Delete a device by its ID.
    create: Create a new device.
    update: Update a device by its ID.
    parameter-list: Get a list of the configuration parameters of a device by its ID.
  `),
  deviceID: z.string().describe("The ID of the Device to perform the operation on. Optional for lookup and create, but required for update, delete and parameter-list operations.").optional(),
  // Separate fields for different operations to maintain type safety
  lookupDevice: deviceLookupSchema.describe("The device to be listed. Required for lookup operations.").optional(),
  createDevice: deviceCreateSchema.describe("The device to be created. Required for create operations.").optional(),
  updateDevice: deviceUpdateSchema.describe("The device to be updated. Required for update operations.").optional(),
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

  // list and info operations are valid with or without query
  return true;
}, {
  message: "Invalid data structure for the specified operation. Create requires createDevice, update requires updateDevice.",
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
      const result = await resources.devices.edit(deviceID as string, validatedParams.updateDevice as DeviceEditInfo);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
    case "delete": {
      const result = await resources.devices.delete(deviceID as string);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
    case "parameter-list": {
      const result = await resources.devices.paramList(deviceID as string);
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
