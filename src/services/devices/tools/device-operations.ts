import { Resources, 
  DeviceCreateInfo,
  DeviceEditInfo,
  DeviceListItem,
  DeviceQuery,
} from "@tago-io/sdk";
import { z } from "zod/v3";
import {
  querySchema,
  tagsObjectModel,
} from "../../../utils/global-params.model";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { createOperationFactory } from "../../../utils/operation-factory";
import { IDeviceToolConfig } from "../../types";

const configParamSchema = z
  .object({
    id: z
      .string()
      .describe(
        "The ID of the configuration parameter. When present, updates existing parameter. When not present, creates new parameter.",
      )
      .optional(),
    sent: z
      .boolean()
      .describe("The sent status of the configuration parameter."),
    key: z.string().describe("The key of the configuration parameter."),
    value: z.string().describe("The value of the configuration parameter."),
  })
  .describe("The configuration parameter of the device.");

const deviceConfigureSchema = z
  .object({
    configuration_params: z
      .array(configParamSchema)
      .describe(
        "Array of configuration parameters to set/update. When ID is present, updates existing parameter. When ID is not present, creates new parameter.",
      )
      .min(1, "At least one configuration parameter is required"),
  })
  .describe("Schema for the device configuration operation.");

const deviceLookupSchema = querySchema
  .extend({
    filter: z
      .object({
        id: z
          .string()
          .describe("Filter by device ID. E.g: 'device_id'")
          .length(24, "Device ID must be 24 characters long")
          .optional(),
        name: z
          .string()
          .describe(
            `
          The name filter uses wildcard matching, so do not need to specify the exact device name.
          For example, searching for "sensor" finds devices like "Temperature Sensor" and "Humidity Sensor".
        `,
          )
          .transform((val) => `*${val}*`)
          .optional(),
        active: z
          .boolean()
          .describe("Filter by active status. E.g: true")
          .optional(),
        connector: z
          .string()
          .describe("Filter by connector ID. E.g: 'connector_id'")
          .length(24, "Connector ID must be 24 characters long")
          .optional(),
        network: z
          .string()
          .describe("Filter by network ID. E.g: 'network_id'")
          .length(24, "Network ID must be 24 characters long")
          .optional(),
        type: z
          .enum(["mutable", "immutable"])
          .describe("Filter by device type. E.g: 'mutable' or 'immutable'")
          .optional(),
        tags: z
          .array(tagsObjectModel.partial())
          .describe(
            "Filter by tags. E.g: [{ key: 'device_type', value: 'sensor' }]",
          )
          .optional(),
        updated_at: z
          .string()
          .describe("Filter by updated at. E.g: '2021-01-01'")
          .optional(),
        created_at: z
          .string()
          .describe("Filter by created at. E.g: '2021-01-01'")
          .optional(),
        orderBy: z
          .string()
          .default("name,asc")
          .describe("Sort by field and order. E.g: 'name,asc' or 'name,desc'")
          .optional(),
      })
      .describe(
        "Filter object to apply to the query. Available filters: id, name, active, connector, network, type, tags",
      )
      .optional(),
    include_data_amount: z
      .boolean()
      .describe(
        "If true, includes the amount of data for each device in the response. This option is only available when filtering by a single device. Default: false.",
      )
      .optional(),
    include_configuration_params: z
      .boolean()
      .describe(
        "If true, includes the configuration parameters for each device in the response. Default: false.",
      )
      .optional(),
  })
  .describe("The device to be listed. Required for lookup operations.");

const deviceCreateSchema = z
  .object({
    name: z.string().describe("The name of the device."),
    connector: z
      .string()
      .describe(
        `The connector ID of the device.
    If given a name you can search a connector by using the integration-lookup operation.
    If not given the ID or name use the default connector ID.
    If has been given connector name or ID and network name or ID, the network ID must be same as the connector network ID.
    If network ID or name is not given, the network ID will be the same as the connector network ID.
    Default: 62333bd36977fc001a2990c8
  `,
      )
      .default("62333bd36977fc001a2990c8"),
    network: z
      .string()
      .describe(
        `The network ID of the device.
    If given a name you can search a network by using the integration-lookup operation.
    If not given the ID or name use the default network ID.
    If has been given connector name or ID and network name or ID, the network ID must be same as the connector network ID.
    If network ID or name is not given, the network ID will be the same as the connector network ID.
    Default: 62336c32ab6e0d0012e06c04
  `,
      )
      .default("62336c32ab6e0d0012e06c04"),
    type: z
      .enum(["mutable", "immutable"])
      .describe(
        "The type of data storage of the device. When not given, the type will be mutable.",
      ),
    tags: z
      .array(tagsObjectModel)
      .describe(
        "The tags for the device. E.g: [{ key: 'device_type', value: 'sensor' }]",
      )
      .optional(),
    description: z
      .string()
      .describe("The description of the device.")
      .optional(),
    active: z
      .boolean()
      .describe(
        "The active status of the device. When not given, the active status will be true.",
      )
      .optional(),
    configuration_params: z
      .array(configParamSchema)
      .describe(
        "The configuration parameters of the device. E.g: [{ key: 'dashboard_url', value: 'https://admin.tago.io', sent: true }]",
      )
      .optional(),
    serie_number: z
      .string()
      .describe(
        "The serial number of the device. This serial number can be an EUI, a MQTT Client ID or an IMEI",
      )
      .optional(),
    chunk_period: z
      .enum(["day", "week", "month", "quarter"])
      .describe(
        "The chunk period of the device. This defines the period of time for the data to be stored in the database. Required for immutable devices.",
      )
      .optional(),
    chunk_retention: z
      .number()
      .describe(
        "The chunk retention of the device. This defines the number of days, weeks, months or quarters to keep the data in the database. Required for immutable devices.",
      )
      .optional(),
    payload_decoder: z
      .string()
      .describe(
        "The payload parser of the device. This is a javascript code that will be used to decode the payload of the device. This must be a valid javascript code.",
      )
      .optional(),
  })
  .describe("The device to be created. Required for create operations.");

const deviceUpdateSchema = deviceCreateSchema
  .partial()
  .describe("Schema for the device update operation.")
  .optional()
  .describe("Schema for the device update operation.");

type DeviceConfigurationParam = z.infer<typeof configParamSchema>;
type DeviceWithMoreInfo = DeviceListItem & {
  data_amount?: number;
  configuration_params?: DeviceConfigurationParam[];
};

const deviceBaseSchema = z
  .object({
    operation: z.enum(["lookup", "delete", "create", "update", "configure"])
      .describe(`The type of operation to perform on the device.
    lookup: Get the information of a device by its ID or a list of devices by a query.
    delete: Delete a device by its ID.
    create: Create a new device.
    update: Update a device by its ID.
    configure: Set or update configuration parameters for a device.
  `),
    deviceID: z
      .string()
      .describe(
        "The ID of the Device to perform the operation on. Optional for lookup and create, but required for update, delete, and configure operations.",
      )
      .optional(),
    // Separate fields for different operations to maintain type safety
    lookupDevice: deviceLookupSchema
      .describe("The device to be listed. Required for lookup operations.")
      .optional(),
    createDevice: deviceCreateSchema
      .describe("The device to be created. Required for create operations.")
      .optional(),
    updateDevice: deviceUpdateSchema
      .describe("The device to be updated. Required for update operations.")
      .optional(),
    configureDevice: deviceConfigureSchema
      .describe(
        "The configuration parameters to set/update. Required for configure operations.",
      )
      .optional(),
  })
  .describe(
    "Schema for the device operation. The delete operation only requires the deviceID.",
  );

const deviceSchema = deviceBaseSchema.refine(
  (data) => {
    // Validation for create operation
    if (data.operation === "create") {
      return !!data.createDevice;
    }

    // Validation for update operation
    if (data.operation === "update") {
      return !!data.updateDevice;
    }

    // Validation for configure operation
    if (data.operation === "configure") {
      return !!data.configureDevice && !!data.deviceID;
    }

    // lookup and delete operations are valid with or without query
    return true;
  },
  {
    message:
      "Invalid data structure for the specified operation. Create requires createDevice, update requires updateDevice, configure requires configureDevice and deviceID.",
  },
);

type DeviceSchema = z.infer<typeof deviceSchema>;

function validateDeviceQuery(query: any): DeviceQuery | undefined {
  if (!query) {
    return undefined;
  }

  const amount = query.amount || 200;

  return {
    amount,
    fields: [
      "id",
      "active",
      "name",
      "tags",
      "connector",
      "network",
      "type",
      "created_at",
      "updated_at",
    ],
    ...query,
  };
}

// Operation handlers
async function handleLookupOperation(
  resources: Resources,
  params: DeviceSchema,
): Promise<string> {
  const { deviceID, lookupDevice } = params;

  if (deviceID) {
    const result = await resources.devices.info(deviceID);
    return convertJSONToMarkdown(result);
  }

  const validatedQuery = validateDeviceQuery(lookupDevice);
  const devices = await resources.devices
    .list(validatedQuery)
    .catch((error) => {
      throw `**Error fetching devices:** ${(error as Error)?.message || error}`;
    });

  let devicesWithMoreInfo: DeviceWithMoreInfo[] = devices as DeviceWithMoreInfo[];

  if (
    devices.length !== 1 &&
    (lookupDevice?.include_data_amount ||
      lookupDevice?.include_configuration_params)
  ) {
    let response = convertJSONToMarkdown(devicesWithMoreInfo);
    response +=
      "\n\n**Critical**: The 'include_data_amount' and 'include_configuration_params' options are only available when filtering by a single device.";
    return response;
  }

  if (devices.length === 1) {
    let deviceInfo = { ...devices[0] } as DeviceWithMoreInfo;

    if (lookupDevice?.include_data_amount) {
      const dataAmount = await resources.devices.amount(devices[0].id);
      deviceInfo = { ...deviceInfo, data_amount: dataAmount };
    }

    if (lookupDevice?.include_configuration_params) {
      const configurationParams = await resources.devices.paramList(
        devices[0].id,
      );
      deviceInfo = { ...deviceInfo, configuration_params: configurationParams };
    }

    devicesWithMoreInfo = [deviceInfo];
  }

  return convertJSONToMarkdown(devicesWithMoreInfo);
}

async function handleCreateOperation(
  resources: Resources,
  params: DeviceSchema,
): Promise<string> {
  if (!params.createDevice) {
    throw new Error("createDevice is required for create operation");
  }

  const { configuration_params, ...deviceData } = params.createDevice;

  // Create the device without configuration parameters
  const result = await resources.devices.create(deviceData as DeviceCreateInfo);

  // If configuration parameters were provided, set them after device creation
  if (configuration_params && configuration_params.length > 0) {
    try {
      const configParams = configuration_params.map((param) => ({
        sent: param.sent,
        key: param.key,
        value: param.value,
      }));

      await resources.devices.paramSet(result.device_id, configParams);
    } catch (error) {
      return convertJSONToMarkdown({
        device: result,
        configuration_error: (error as Error)?.message || error,
      });
    }
  }

  return convertJSONToMarkdown(result);
}

async function handleUpdateOperation(
  resources: Resources,
  params: DeviceSchema,
): Promise<string> {
  const { deviceID, updateDevice } = params;

  if (!deviceID) {
    throw new Error("deviceID is required for update operation");
  }

  if (!updateDevice) {
    throw new Error("updateDevice is required for update operation");
  }

  // Handle payload decoder encoding
  if (updateDevice.payload_decoder) {
    updateDevice.payload_decoder = Buffer.from(
      updateDevice.payload_decoder,
    ).toString("base64");
  }

  let tokenObject;
  if (
    updateDevice.network ||
    updateDevice.connector ||
    updateDevice.serie_number
  ) {
    [tokenObject] = await resources.devices.tokenList(deviceID);
    await resources.devices.tokenDelete(tokenObject.token);
  }

  const result = await resources.devices.edit(
    deviceID,
    updateDevice as DeviceEditInfo,
  );

  if (tokenObject) {
    await resources.devices.tokenCreate(deviceID, {
      name: tokenObject.name,
      permission: "full",
      serie_number:
        updateDevice.serie_number || tokenObject.serie_number || undefined,
    });
  }

  return convertJSONToMarkdown(result);
}

async function handleDeleteOperation(
  resources: Resources,
  params: DeviceSchema,
): Promise<string> {
  const { deviceID } = params;

  if (!deviceID) {
    throw new Error("deviceID is required for delete operation");
  }

  const result = await resources.devices.delete(deviceID);
  return convertJSONToMarkdown(result);
}

async function handleConfigureOperation(
  resources: Resources,
  params: DeviceSchema,
): Promise<string> {
  const { deviceID, configureDevice } = params;

  if (!deviceID) {
    throw new Error("deviceID is required for configure operation");
  }

  if (!configureDevice) {
    throw new Error("configureDevice is required for configure operation");
  }

  const results = [];

  for (const configParam of configureDevice.configuration_params) {
    try {
      const result = await resources.devices.paramSet(deviceID, {
        id: configParam.id,
        sent: configParam.sent,
        key: configParam.key,
        value: configParam.value,
      });
      results.push({
        operation: configParam.id ? "updated" : "created",
        parameter: configParam.key,
        result,
      });
    } catch (error) {
      results.push({
        operation: "failed",
        parameter: configParam.key,
        error: (error as Error)?.message || error,
      });
    }
  }

  return convertJSONToMarkdown(results);
}

/**
 * @description Performs device operations and returns a Markdown-formatted response.
 */
async function deviceOperationsTool(
  resources: Resources,
  params: DeviceSchema,
) {
  const validatedParams = deviceSchema.parse(params);

  const factory = createOperationFactory<DeviceSchema>()
    .register("lookup", (params) => handleLookupOperation(resources, params))
    .register("create", (params) => handleCreateOperation(resources, params))
    .register("update", (params) => handleUpdateOperation(resources, params))
    .register("delete", (params) => handleDeleteOperation(resources, params))
    .register("configure", (params) =>
      handleConfigureOperation(resources, params),
    );

  return factory.execute(validatedParams);
}

const deviceOperationsConfigJSON: IDeviceToolConfig = {
  name: "device-operations",
  description: `The DeviceOperations tool manages IoT device entities within the TagoIO platform, supporting five primary operations: lookup/list, create, update, delete, and configure. This tool handles device configuration and management rather than the data stored within devices. Each device represents an IoT endpoint that can communicate through various protocols, called Networks, including LoRaWAN, MQTT, HTTP, and REST API.

Use this tool when you need to discover existing devices, provision new IoT endpoints, modify device configurations, manage configuration parameters, or remove devices from your TagoIO account.

The configure operation allows you to set or update device configuration parameters independently from other device properties. When a parameter ID is provided, it updates the existing parameter; when no ID is provided, it creates a new parameter.

Do not use this tool for managing data stored within devices (use DeviceDataOperations instead), real-time device communication, or protocol-specific configuration that requires direct network access. This tool manages device entities in the platform, not device firmware or hardware settings.

Important limitations: Device type (mutable/immutable) cannot be changed after creation. Storage limits apply to mutable devices but not immutable ones. Device deletion is permanent and removes all associated data.

For create operations, ensure you have connector and network IDs.

<example>
  {
    "operation": "lookup",
    "lookupDevice": {
      "filter": {
        "name": "My Device",
        "tags": [{ "key": "device_type", "value": "sensor" }]
      }
    }
  }
</example>`,
  parameters: deviceBaseSchema.shape,
  title: "Device Operations",
  tool: deviceOperationsTool,
};

export { deviceOperationsConfigJSON };
export { deviceBaseSchema }; // export for testing purposes
