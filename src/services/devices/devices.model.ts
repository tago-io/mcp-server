import { z } from "zod";

import { queryModel, tagsObjectModel } from "../../utils/global-params.model";

const deviceListModel = {
  ...queryModel,
  filter: z
    .object({
      id: z.string().describe("Filter by device ID. E.g: 'device_id'").length(24, "Device ID must be 24 characters long").optional(),
      name: z.string().describe("Filter by name. E.g: 'Device Test'").optional(),
      active: z.boolean().describe("Filter by active status. E.g: true").optional(),
      connector: z.string().describe("Filter by connector ID. E.g: 'connector_id'").length(24, "Connector ID must be 24 characters long").optional(),
      network: z.string().describe("Filter by network ID. E.g: 'network_id'").length(24, "Network ID must be 24 characters long").optional(),
      type: z.enum(["mutable", "immutable"]).describe("Filter by device type. E.g: 'mutable' or 'immutable'").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'device_type', value: 'sensor' }]").optional(),
    })
    .describe("Filter object to apply to the query. Available filters: id, name, active, connector, network, type, tags")
    .optional(),
  fields: z
    .array(z.enum(["id", "active", "name", "description", "created_at", "updated_at", "connector", "network", "type"]))
    .describe("Specific fields to include in the device list response. Available fields: id, active, name, description, created_at, updated_at, connector, network, type")
    .optional(),
};

// Device data model as a raw shape object compatible with server.tool
const deviceDataModel = {
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
  variables: z
    .union([z.string(), z.array(z.string())])
    .describe("Filter by variables. Can be a single variable name or an array of variable names. E.g: 'temperature' or ['temperature', 'humidity']")
    .optional(),
  groups: z
    .union([z.string(), z.array(z.string())])
    .describe("Filter by groups. Can be a single group or an array of groups. E.g: 'sensors' or ['sensors', 'actuators']")
    .optional(),
  ids: z
    .union([z.string(), z.array(z.string())])
    .describe("Filter by record IDs. Can be a single ID or an array of IDs. E.g: '507f1f77bcf86cd799439011' or ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']")
    .optional(),
  values: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))])
    .describe("Filter by values. Can be a single value or an array of values of different types. E.g: 25.5 or [25.5, 'high', true]")
    .optional(),
  start_date: z.union([z.string(), z.date()]).describe("Start date for filtering data. Can be a Date object or an ISO string. E.g: 'YYYY-MM-DDTHH:MM:SSZ' (ISO 8601)").optional(),
  end_date: z
    .union([z.string(), z.date()])
    .describe("End date for filtering data. Can be a Date object or an ISO string. Default is current date. E.g: 'YYYY-MM-DDTHH:MM:SSZ' (ISO 8601)")
    .optional(),

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
};

export { deviceListModel, deviceDataModel };
