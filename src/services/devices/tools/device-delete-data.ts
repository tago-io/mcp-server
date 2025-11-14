import { z } from "zod/v3";
import { Device, Resources, DataQuery } from "@tago-io/sdk";
import { ENV } from "../../../utils/get-env-variables";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { IDeviceToolConfig } from "../../types";
import { querySchema, validateDeviceDataQuery } from "./device-data";

// Base schema without refinement - this provides the .shape property needed by MCP
const deviceDeleteDataBaseSchema = z
  .object({
    deviceID: z
      .string({ required_error: "Device ID is required" })
      .length(24, "Device ID must be 24 characters long")
      .describe("The ID of the device to perform the operation on."),
    // Fields for delete operations
    query: z.object(querySchema.shape).omit({ query: true }).describe("The query object contains deletion criteria with several optional parameters.").optional(),
  })
  .describe("Schema for the device data delete operation. Data Delete require the device to be of the mutable type.");

// Refined schema with validation logic
const deviceDeleteDataSchema = deviceDeleteDataBaseSchema.refine(
  () => {
    // Delete operations are valid with or without query
    return true;
  },
  {
    message: "Invalid data structure for the specified operation. Delete requires query.",
  }
);

type DeviceDeleteDataOperation = z.infer<typeof deviceDeleteDataSchema>;

// Simple delete operation - analysis token
async function deleteWithAnalysisToken(resources: Resources, deviceID: string, query?: DataQuery): Promise<string> {
  const result = await resources.devices.deleteDeviceData(deviceID, query);
  return convertJSONToMarkdown(result);
}

// Simple delete operation - device token
async function deleteWithDeviceToken(resources: Resources, api: string, deviceID: string, query?: DataQuery): Promise<string> {
  const [deviceToken] = await resources.devices.tokenList(deviceID);
  const device = new Device({
    token: deviceToken.token,
    region: { api: api } as any,
  });

  const result = await device.deleteData(query);
  return convertJSONToMarkdown(result);
}

async function deviceDataDeleteTool(resources: Resources, params: DeviceDeleteDataOperation) {
  const validatedParams = deviceDeleteDataSchema.parse(params);
  const query = validateDeviceDataQuery(validatedParams.query);

  const token = ENV.TAGOIO_TOKEN;
  const api = ENV.TAGOIO_API;

  // Simple token type check and direct function call
  return token.startsWith("a-") ? deleteWithAnalysisToken(resources, validatedParams.deviceID, query) : deleteWithDeviceToken(resources, api, validatedParams.deviceID, query);
}

const deviceDeleteDataConfigJSON: IDeviceToolConfig = {
  name: "device-delete-data",
  description: `The DeviceDataDelete tool removes specific data points from IoT devices and data collection systems within the platform

  Do not use this tool on immutable devices, as deletion operations will fail.

Delete query parameters apply individually to each specified variable. For example, setting qty to 2 will delete 2 data points from each variable listed in the variables array.

<example>
  {
    "deviceID": "68531cc713af9d000af75d5c",
    "query": {
      "qty": 1,
      "skip": 0,
      "variables": ["temperature", "humidity],
      "groups": ["123456789"]
    }
  }
</example>`,
  parameters: deviceDeleteDataBaseSchema.shape,
  title: "Device Data Delete",
  tool: deviceDataDeleteTool,
};

export { DeviceDeleteDataOperation, deviceDeleteDataConfigJSON };
export { deviceDeleteDataBaseSchema }; // export for testing purposes
