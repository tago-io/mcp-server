import { Resources } from "@tago-io/sdk";
import { DataQuery, DeviceQuery } from "@tago-io/sdk/lib/types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { toMarkdown } from "../../utils/markdown";
import { genericIDModel } from "../../utils/global-params.model";
import { deviceDataModel, deviceListModel } from "./devices.model";

/**
 * @description Get all devices and returns a Markdown-formatted response.
 */
async function _getDevices(resources: Resources, query?: DeviceQuery) {
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

/**
 * @description Get data from a device and returns a Markdown-formatted response.
 */
async function _getDeviceData(resources: Resources, deviceID: string, query?: DataQuery) {
  const data = await resources.devices.getDeviceData(deviceID, query).catch((error) => {
    throw `**Error to get device data:** ${error}`;
  });

  const markdownResponse = toMarkdown(data);

  return markdownResponse;
}

/**
 * @description Get a device information by its ID and returns a Markdown-formatted response.
 */
async function _getDeviceByID(resources: Resources, deviceID: string) {
  const device = await resources.devices.info(deviceID).catch((error) => {
    throw `**Error to get device by ID:** ${error}`;
  });

  const markdownResponse = toMarkdown(device);

  return markdownResponse;
}

/**
 * @description Handler for devices tools to register tools in the MCP server.
 */
async function handlerDevicesTools(server: McpServer, resources: Resources) {
  server.tool("list_devices", "List all devices", deviceListModel, async (params) => {
    const result = await _getDevices(resources, params);
    return { content: [{ type: "text", text: result }] };
  });

  server.tool("get_device_data", "Get data from a device", deviceDataModel, async (params) => {
    const result = await _getDeviceData(resources, params.deviceID, params);
    return { content: [{ type: "text", text: result }] };
  });

  server.tool("get_device_by_id", "Get a device by its ID", genericIDModel, async (params) => {
    const result = await _getDeviceByID(resources, params.id);
    return { content: [{ type: "text", text: result }] };
  });
}

export { handlerDevicesTools };
