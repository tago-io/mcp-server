import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { DataQuery } from "@tago-io/sdk/lib/types";

import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";

// Device data model as a raw shape object compatible with server.tool
const getDeviceDataSchema = z.object({
  deviceID: z.string({ required_error: "Device ID is required" }).length(24, "Device ID must be 24 characters long").describe("Unique identifier for the device"),

  // Query parameters
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

/**
 * @description Get data from a device and returns a Markdown-formatted response.
 */
async function getDeviceDataTool(resources: Resources, params: { deviceID: string; query?: DataQuery }) {
  const { deviceID, ...queryParams } = params;
  const data = await resources.devices.getDeviceData(deviceID, queryParams as DataQuery).catch((error) => {
    throw `**Error to get device data:** ${error}`;
  });

  const markdownResponse = convertJSONToMarkdown(data);

  return markdownResponse;
}

const getDeviceDataConfigJSON: IDeviceToolConfig = {
  name: "get-device-data",
  description: `
    Get data from a device by its ID.

    For queries 'min', 'max', 'count', 'avg', and 'sum', if the requested period exceeds one month,
    the request must be split into parts, each covering a maximum interval of one month.
  `,
  parameters: getDeviceDataSchema.shape,
  title: "Get Device Data",
  tool: getDeviceDataTool,
};

export { getDeviceDataConfigJSON };
export { getDeviceDataSchema }; // export for testing purposes
