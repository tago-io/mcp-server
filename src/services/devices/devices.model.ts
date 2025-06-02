import { z } from "zod";

const deviceListModel = {
  amount: z.number().optional(),
  fields: z.array(z.enum(["id", "active", "name", "description", "created_at", "updated_at", "connector", "network", "type"])).optional(),
};

// Base Model for common query parameters
const deviceDataModel = {
  deviceID: z.string({ required_error: "Device ID is required" }).describe("Device ID"),
  variables: z.union([z.string(), z.array(z.string())]).optional(),
  groups: z.union([z.string(), z.array(z.string())]).optional(),
  ids: z.union([z.string(), z.array(z.string())]).optional(),
  values: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))]).optional(),
  qty: z.number().describe("Quantity of records to retrieve").optional(),
  start_date: z.union([z.string(), z.date()]).optional(),
  end_date: z.union([z.string(), z.date()]).optional(),
  details: z.boolean().optional(),
};

export { deviceListModel, deviceDataModel };
