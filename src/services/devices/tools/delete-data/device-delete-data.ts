import { z } from "zod/v3";
import { Device, Resources } from "@tago-io/sdk";
import { DataQuery } from "@tago-io/sdk/lib/modules/Device/device.types";
import { ENV } from "../../../../utils/get-env-variables";
import { convertJSONToMarkdown } from "../../../../utils/markdown";
import { IDeviceToolConfig } from "../../../types";
import { querySchema, validateDeviceDataQuery } from "../data/device-data";

// Base schema without refinement - this provides the .shape property needed by MCP
const deviceDeleteDataBaseSchema = z.object({
  operation: z.enum(["delete"]).describe("The type of operation to perform on the device data."),
  deviceID: z.string({ required_error: "Device ID is required" }).length(24, "Device ID must be 24 characters long").describe("The ID of the device to perform the operation on."),
  // Fields for delete operations
  query: z.object(querySchema.shape).omit({ query: true }).describe("The query to perform delete operations on the device's database.").optional(),
}).describe("Schema for the device data delete operation. Data Delete require the device to be of the mutable type.");

// Refined schema with validation logic
const deviceDeleteDataSchema = deviceDeleteDataBaseSchema.refine(() => {
  // Delete operations are valid with or without query
  return true;
}, {
  message: "Invalid data structure for the specified operation. Delete requires query.",
});

type DeviceDeleteDataOperation = z.infer<typeof deviceDeleteDataSchema>;

// Define interface for data operation handlers
interface DataOperationHandler {
  delete(deviceID: string, query?: DataQuery): Promise<string>;
}

// Analysis Token Handler Factory
function createAnalysisTokenHandler(resources: Resources): DataOperationHandler {
  return {
    async delete(deviceID: string, query?: DataQuery): Promise<string> {
      const result = await resources.devices.deleteDeviceData(deviceID, query);
      return convertJSONToMarkdown(result);
    },
  };
}

// Device Token Handler Factory
function createDeviceTokenHandler(resources: Resources, api: string): DataOperationHandler {
  const getDeviceInstance = async (deviceID: string): Promise<Device> => {
    const [deviceToken] = await resources.devices.tokenList(deviceID);
    return new Device({
      token: deviceToken.token,
      region: { api: api } as any
    });
  };

  return {
    async delete(deviceID: string, query?: DataQuery): Promise<string> {
      const device = await getDeviceInstance(deviceID);
      const result = await device.deleteData(query);
      return convertJSONToMarkdown(result);
    },
  };
}

// Create appropriate handler based on token type
function createDataOperationHandler(token: string, resources: Resources, api: string): DataOperationHandler {
  const handlers = {
    analysis: () => createAnalysisTokenHandler(resources),
    device: () => createDeviceTokenHandler(resources, api)
  };

  const handlerType = token.startsWith("a-") ? "analysis" : "device";
  const handler = handlers[handlerType];
  
  if (!handler) {
    throw new Error(`Unsupported token type: ${handlerType}`);
  }

  return handler();
}

// Operation executor
const operationExecutors = {
  delete: async (handler: DataOperationHandler, params: DeviceDeleteDataOperation) => {
    const query = validateDeviceDataQuery(params.query);
    return handler.delete(params.deviceID as string, query);
  }
} as const;

async function deviceDataDeleteTool(resources: Resources, params: DeviceDeleteDataOperation) {
  const validatedParams = deviceDeleteDataSchema.parse(params);
  const { operation } = validatedParams;

  const api = ENV.TAGOIO_API;
  const token = ENV.TAGOIO_TOKEN;

  // Creates appropriate handler based on token type
  const handler = createDataOperationHandler(token, resources, api);
  
  // Execute operation
  return operationExecutors[operation](handler, validatedParams);
}

const deviceDeleteDataConfigJSON: IDeviceToolConfig = {
  name: "device-delete-data-operations",
  description: `Perform operations on device data. It can be used to delete data from a device.
  
  **Data Delete require the device to be of the mutable type.**
  
  - NEVER use spaces in variable names. They should always use snake_case.
  - NEVER use special characters in variable names. They should always use alphanumeric characters.
  - Variables should contain the unit of measurement in the unit field whenever possible.
  - ALWAYS use descriptive property names inside the metadata field.

  <example>
    {
      "operation": "delete",
      "deviceID": "68531cc713af9d000af75d5c",
      "query": {
        "qty": 1,
        "skip": 0,
        "variables": ["temperature"],
        "groups": ["123456789"]
      }
    }
  </example>

  `,
  parameters: deviceDeleteDataBaseSchema.shape,
  title: "Device Data Delete Operations",
  tool: deviceDataDeleteTool,
};

export { DeviceDeleteDataOperation, deviceDeleteDataConfigJSON };
export { deviceDeleteDataBaseSchema } // export for testing purposes