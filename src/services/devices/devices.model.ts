import { z } from "zod";

import { queryModel, tagsObjectModel } from "../../utils/global-params.model";

const deviceListModel = {
  ...queryModel,
  filter: z
    .object({
      name: z.string().describe("Filter by name. E.g: 'Device Test'").optional(),
      active: z.boolean().describe("Filter by active status. E.g: true").optional(),
      connector: z.string().describe("Filter by connector ID. E.g: 'connector_id'").length(24, "Connector ID must be 24 characters long").optional(),
      network: z.string().describe("Filter by network ID. E.g: 'network_id'").length(24, "Network ID must be 24 characters long").optional(),
      type: z.enum(["mutable", "immutable"]).describe("Filter by device type. E.g: 'mutable' or 'immutable'").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'device_type', value: 'sensor' }]").optional(),
    })
    .describe("Filter object to apply to the query. Available filters: name, active, connector, network, type, tags")
    .optional(),
  fields: z
    .array(z.enum(["id", "active", "name", "description", "created_at", "updated_at", "connector", "network", "type"]))
    .describe("Specific fields to include in the device list response. Available fields: id, active, name, description, created_at, updated_at, connector, network, type")
    .optional(),
};

// Base Model for common query parameters
const deviceDataModel = {
  deviceID: z.string({ required_error: "Device ID is required" }).describe("Unique identifier for the device"),
  variables: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Variable names to filter or retrieve data for. Can be a single variable or an array of variables"),
  groups: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Group identifiers to filter data by. Can be a single group or an array of groups"),
  ids: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Specific record identifiers to retrieve. Can be a single ID or an array of IDs"),
  values: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))])
    .optional()
    .describe("Values to filter or match against. Can be a single value or an array of values of different types"),
  qty: z.number().min(1).max(10000).describe("Quantity of records to retrieve (max: 10000, min: 1)").optional(),
  start_date: z
    .string()
    .datetime({ message: "Start date must be in ISO 8601 format (e.g., '2024-03-20T00:00:00Z')" })
    .optional()
    .describe("Start date for filtering data in ISO 8601 format (e.g., '2024-03-20T00:00:00Z')"),
  end_date: z
    .string()
    .datetime({ message: "End date must be in ISO 8601 format (e.g., '2024-03-20T23:59:59Z')" })
    .optional()
    .describe("End date for filtering data in ISO 8601 format (e.g., '2024-03-20T23:59:59Z')"),
};

export { deviceListModel, deviceDataModel };
