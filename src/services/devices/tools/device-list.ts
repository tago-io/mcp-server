import { Resources } from "@tago-io/sdk";
import { DeviceQuery } from "@tago-io/sdk/lib/types";
import { toMarkdown } from "../../../utils/markdown";
import { z } from "zod/v3";
import { queryModel, tagsObjectModel } from "../../../utils/global-params.model";

const deviceListSchema = {
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
    .array(z.enum(["id", "active", "name", "tags", "created_at", "updated_at", "connector", "network", "type"]))
    .describe("Specific fields to include in the device list response. Available fields: id, active, name, tags, created_at, updated_at, connector, network, type")
    .optional(),
};

/**
 * @description Get all devices and returns a Markdown-formatted response.
 */
async function getDeviceListTool(resources: Resources, query?: DeviceQuery) {
  if (query?.filter?.name) {
    query.filter.name = `*${query.filter.name}*`;
  }

  const amount = query?.amount || 200;
  const fields = query?.fields || ["id", "active", "name", "description", "created_at", "updated_at", "connector", "network", "type"];

  const devices = await resources.devices
    .list({
      amount,
      fields,
      ...query,
    })
    .catch((error) => {
      throw `**Error to get devices:** ${error}`;
    });

  const markdownResponse = toMarkdown(devices);

  return markdownResponse;
}

const deviceConfigJSON = {
  name: "get-device-list",
  description: "Get a list of devices",
  parameters: deviceListSchema,
  tool: getDeviceListTool,
};

export { deviceConfigJSON };
