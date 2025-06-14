import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { DeviceQuery, DeviceListItem } from "@tago-io/sdk/lib/types";

import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema, tagsObjectModel } from "../../../utils/global-params.model";

const deviceListSchema = {
  ...querySchema,
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
};

type DeviceWithDataAmount = DeviceListItem & { data_amount?: number };

/**
 * @description Get all devices and returns a Markdown-formatted response.
 */
async function getDeviceLookupTool(resources: Resources, query?: DeviceQuery & { include_data_amount?: boolean }) {
  const amount = query?.amount || 200;
  const fields = query?.fields || ["id", "active", "name", "created_at", "updated_at", "connector", "network", "type"];

  const devices = await resources.devices
    .list({
      amount,
      fields,
      ...query,
    })
    .catch((error) => {
      throw `**Error to get devices:** ${error}`;
    });

  let devicesWithDataAmount: DeviceWithDataAmount[] = devices;

  if (query?.include_data_amount && devices.length === 1) {
    const dataAmount = await resources.devices.amount(devices[0].id);
    devicesWithDataAmount = [{ ...devices[0], data_amount: dataAmount }];
  } else if (query?.include_data_amount && devices.length !== 1) {
    throw "The 'include_data_amount' option is only available when filtering by a single device.";
  }

  const markdownResponse = convertJSONToMarkdown(devicesWithDataAmount);

  return markdownResponse;
}

const deviceLookupConfigJSON: IDeviceToolConfig = {
  name: "device-lookup",
  description: `
    Get a list of devices.

    If the parameter 'include_data_amount' is set to true, the response will include the amount of data for the device (field: data_amount).
    Note: This option is only available when filtering by a single device.
  `,
  parameters: deviceListSchema,
  title: "Device Lookup",
  tool: getDeviceLookupTool,
};

export { deviceLookupConfigJSON };
export { deviceListSchema }; // export for testing purposes
