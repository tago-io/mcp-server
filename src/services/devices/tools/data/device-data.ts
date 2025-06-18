import { z } from "zod/v3";

import { Device, Resources } from "@tago-io/sdk";
import { DataCreate, DataEdit } from "@tago-io/sdk/lib/common/common.types";
import { DataQuery } from "@tago-io/sdk/lib/modules/Device/device.types";

import { ENV } from "../../../../utils/get-env-variables";
import { convertJSONToMarkdown } from "../../../../utils/markdown";
import { IDeviceToolConfig } from "../../../types";

// Zod schema for LocationLatLng
const locationLatLngSchema = z.object({
  lat: z.number().describe("Latitude value."),
  lng: z.number().describe("Longitude value."),
}).describe("Object with latitude and longitude properties.");

// Zod schema for Metadata (flexible object)
const metadataSchema = z.record(z.any()).describe("Flexible metadata object for additional data attributes.");

// Zod schema for DataCreate
const dataCreateZodSchema = z.array(z.object({
  variable: z.string().describe("Name of the variable for the data. (Required)"),
  value: z.union([z.string(), z.number(), z.boolean()]).describe("Data value. Can be string, number, or boolean.").optional(),
  group: z.string().describe("Group for the data. Used for grouping different data values.").optional(),
  unit: z.string().describe("Unit for the data value.").optional(),
  location: z.union([
    locationLatLngSchema,
    z.null().describe("No location provided."),
  ]).describe("Location for the data value. Accepts LatLng, or null.").optional(),
  metadata: metadataSchema.optional(),
  time: z.union([z.string(), z.date()]).describe("Timestamp for the data value. Accepts string (ISO) or Date.").optional(),
  // The following are omitted in DataCreate: id, device, created_at
})).describe("Schema for creating device data (DataCreate type).");

// Zod schema for DataEdit
const dataEditZodSchema = z.array(z.object({
  id: z.string().describe("Data ID. (Required)"),
  value: z.union([z.string(), z.number(), z.boolean()]).describe("Data value. Can be string, number, or boolean.").optional(),
  group: z.string().describe("Group for the data. Used for grouping different data values.").optional(),
  unit: z.string().describe("Unit of measurement for the data value.").optional(),
  metadata: metadataSchema.optional(),
  time: z.union([z.string(), z.date()]).describe("Timestamp for the data value. Accepts string (ISO) or Date.").optional(),
  location: z.union([
    locationLatLngSchema,
    z.null().describe("No location provided."),
  ]).describe("Location for the data value. Accepts LatLng, or null.").optional(),
})).describe("Schema for editing device data (DataEdit type).");


const querySchema = z.object({
  query: z
    .enum([
      "default",
      "last_item",
      "last_value",
      "last_location",
      "last_insert",
      "first_item",
      "first_value",
      "first_location",
      "first_insert",
      "min",
      "max",
      "count",
      "avg",
      "sum",
      "aggregate",
      "conditional",
    ])
    .describe(`
        Type of query to perform. Determines how device data is retrieved and processed.

        Available queries:
        - default: Retrieves multiple data records with pagination support (use with qty and skip)
        - last_item: Returns the most recent record across all variables
        - last_value: Returns the most recent value for specified variable(s)
        - last_location: Returns the most recent location data point
        - last_insert: Returns the most recently inserted record regardless of timestamp
        - first_item: Returns the oldest record across all variables
        - first_value: Returns the oldest value for specified variable(s)
        - first_location: Returns the oldest location data point
        - first_insert: Returns the first inserted record regardless of timestamp
        - min: Calculates the minimum value among the filtered records (requires start_date; the period interval must not exceed one month)
        - max: Calculates the maximum value among the filtered records (requires start_date; the period interval must not exceed one month)
        - count: Returns the total count of records matching the filter criteria (requires start_date; the period interval must not exceed one month)
        - avg: Calculates the average value over time (requires start_date; the period interval must not exceed one month)
        - sum: Calculates the sum of values over time (requires start_date; the period interval must not exceed one month)
        - aggregate: Groups and aggregates data by time intervals (requires interval and function parameters)
        - conditional: Filters data based on value comparison (requires start_date, value, and function parameters)

        Note: If the 'end_date' field is not provided, the API will use the current date as the default value.
      `)
    .optional(),

  // Common parameters
  variables: z.array(z.string()).describe("Filter by variables. Array of variable names. E.g: ['temperature', 'humidity']").optional(),
  groups: z.array(z.string()).describe("Filter by groups. Array of group names. E.g: ['sensors', 'actuators']").optional(),
  ids: z.array(z.string()).describe("Filter by record IDs. Array of record IDs. E.g: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']").optional(),
  values: z.array(z.string()).describe("Filter by values. Array of string values. For numbers or booleans, convert them to strings. E.g: ['25.5', 'high', 'true']").optional(),
  start_date: z.string().describe("Start date for filtering data as ISO string. E.g: 'YYYY-MM-DDTHH:MM:SSZ' (ISO 8601)").optional(),
  end_date: z.string().describe("End date for filtering data as ISO string. Default is current date. E.g: 'YYYY-MM-DDTHH:MM:SSZ' (ISO 8601)").optional(),

  // Default query parameters
  qty: z.number().min(1).max(10000).describe("Quantity of records to retrieve (max: 10000, min: 1)").optional(),
  ordination: z.enum(["descending", "ascending"]).describe("Change ordination of query. Default is 'descending'. E.g: 'ascending'").optional(),
  skip: z.number().min(0).describe("Skip records, used on pagination or polling. E.g: 50").optional(),

  // Aggregate query parameters
  interval: z
    .enum(["minute", "hour", "day", "month", "quarter", "year"])
    .describe(`
        Time interval for aggregation. Used with query='aggregate'. E.g: 'day'

        Available intervals: minute, hour, day, month, quarter, year.
      `)
    .optional(),
  function: z
    .enum(["avg", "sum", "min", "max", "gt", "gte", "lt", "lte", "eq", "ne"])
    .describe(`
        Function to apply.

        For aggregate query:
        - avg: Calculate the average value for each interval
        - sum: Calculate the sum of values for each interval
        - min: Find the minimum value in each interval
        - max: Find the maximum value in each interval

        For conditional query:
        - gt: Greater than (>)
        - gte: Greater than or equal to (>=)
        - lt: Less than (<)
        - lte: Less than or equal to (<=)
        - eq: Equal to (==)
        - ne: Not equal to (!=)

        E.g: 'avg'
      `)
    .optional(),

  // Conditional query parameters
  value: z.number().describe("Value to compare against. Used with query='conditional'. E.g: 25.5").optional(),
});

// Base schema without refinement - this provides the .shape property needed by MCP
const deviceDataBaseSchema = z.object({
  operation: z.enum(["create", "update", "read", "delete"]).describe("The type of operation to perform on the device data."),
  deviceID: z.string({ required_error: "Device ID is required" }).length(24, "Device ID must be 24 characters long").describe("The ID of the device to perform the operation on."),

  // Separate fields for different operations to maintain type safety
  createData: dataCreateZodSchema.describe("The data to be created on the device's database. Required for create operations.").optional(),
  editData: dataEditZodSchema.describe("The data to be edited on the device's database. Required for update operations.").optional(),

  // Fields for read/delete operations
  query: querySchema.describe("The query to perform retrieve or delete operations on the device's database.").optional(),
}).describe("Schema for the device data operation. Data Edit and Data Delete require the device to be of the mutable type.");

// Refined schema with validation logic
const deviceDataSchema = deviceDataBaseSchema.refine((data) => {
  // Validation for create operation
  if (data.operation === "create") {
    return !!data.createData;
  }

  // Validation for update operation
  if (data.operation === "update") {
    return !!data.editData;
  }

  // Read and delete operations are valid with or without query
  return true;
}, {
  message: "Invalid data structure for the specified operation. Create requires createData, update requires editData.",
});

type DeviceDataOperation = z.infer<typeof deviceDataSchema>;

// Type guards for runtime type checking
function isCreateOperation(params: DeviceDataOperation): params is DeviceDataOperation & { createData: z.infer<typeof dataCreateZodSchema> } {
  return params.operation === "create" && !!params.createData;
}

function isUpdateOperation(params: DeviceDataOperation): params is DeviceDataOperation & { editData: z.infer<typeof dataEditZodSchema> } {
  return params.operation === "update" && !!params.editData;
}

function validateDeviceDataQuery(query: any): DataQuery | undefined {
  if (!query) {
    return undefined;
  };

  if (query.query === "conditional") {
    const { start_date, value, function: fn } = query;
    if (
      typeof start_date === "string" &&
      typeof value === "number" &&
      typeof fn === "string"
    ) {
      return query;
    } else {
      throw new Error("Missing required fields for conditional query: start_date (string), value (number), function (string)");
    }
  }

  if (query.query === "aggregate") {
    const { interval, function: fn } = query;
    if (
      typeof interval === "string" &&
      typeof fn === "string"
    ) {
      return query;
    } else {
      throw new Error("Missing required fields for aggregate query: interval (string), function (string)");
    }
  }
  // For all other queries, return as is
  return query;
}

async function deviceDataTool(resources: Resources, params: DeviceDataOperation) {
  // Parse and validate using the refined schema
  const validatedParams = deviceDataSchema.parse(params);
  const { operation, deviceID } = validatedParams;

  const api = ENV.TAGOIO_API;
  const sse = ENV.TAGOIO_API.replace("api", "sse");
  const sanitizedSse = new URL(sse);
  sanitizedSse.pathname = "/events";

  const [deviceToken] = await resources.devices.tokenList(deviceID);
  const device = new Device({
    token: deviceToken.token,
    region: {
      api,
      sse: sanitizedSse.toString()
    }
  })

  switch (operation) {
    case "create": {
      // Use type guard to ensure type safety
      if (!isCreateOperation(validatedParams)) {
        throw new Error("Invalid create operation: createData is required");
      }
      // Safe type assertion to SDK type - our validation guarantees correct structure
      const result = await device.sendData(validatedParams.createData as DataCreate[]);
      const markdown = convertJSONToMarkdown(result);
      return markdown;
    }
    case "update": {
      // Use type guard to ensure type safety
      if (!isUpdateOperation(validatedParams)) {
        throw new Error("Invalid update operation: editData is required");
      }
      // Safe type assertion to SDK type - our validation guarantees correct structure
      const result = await device.editData(validatedParams.editData as DataEdit[]);
      const markdown = convertJSONToMarkdown(result);
      return markdown;
    }
    case "read": {
      const query = validateDeviceDataQuery(validatedParams.query);
      // @ts-expect-error - The getData method is not typed according to the DataQuery type from the Resources.
      const result = await device.getData(query);
      const markdown = convertJSONToMarkdown(result);
      return markdown;
    }
    case "delete": {
      const query = validateDeviceDataQuery(validatedParams.query);
      const result = await device.deleteData(query);
      const markdown = convertJSONToMarkdown(result);
      return markdown;
    }
  }
}

const deviceDataConfigJSON: IDeviceToolConfig = {
  name: "device-data-crud",
  description: "Perform CRUD operations on device data. Data Edit and Data Delete require the device to be of the mutable type.",
  parameters: deviceDataBaseSchema.shape,
  title: "Device Data Operations",
  tool: deviceDataTool,
};

export { deviceDataSchema, DeviceDataOperation, dataCreateZodSchema, dataEditZodSchema, deviceDataConfigJSON };