import { Resources } from "@tago-io/sdk";
import { DataQuery, DeviceQuery } from "@tago-io/sdk/lib/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { toMarkdown } from "../../utils/markdown.js";
import { genericIDModel } from "../../utils/global-params.model.js";
import { deviceDataModel, deviceListModel } from "./devices.model.js";

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
 * @description Get the configuration parameters of a device by its ID and returns a Markdown-formatted response.
 */
async function _getDeviceCFGByID(resources: Resources, deviceID: string) {
  const device = await resources.devices.paramList(deviceID).catch((error) => {
    throw `**Error to get device CFG by ID:** ${error}`;
  });

  const markdownResponse = toMarkdown(device);

  return markdownResponse;
}

/**
 * @description Get the amount of data of a device by its ID and returns a Markdown-formatted response.
 */
async function _getDeviceDataAmountByID(resources: Resources, deviceID: string) {
  const device = await resources.devices.amount(deviceID).catch((error) => {
    throw `**Error to get device data amount by ID:** ${error}`;
  });

  const markdownResponse = toMarkdown(device);

  return markdownResponse;
}

/**
 * @description Handler for devices tools to register tools in the MCP server.
 */
async function handlerDevicesTools(server: McpServer, resources: Resources) {
  server.tool("list-devices", "List all devices", deviceListModel, { title: "List Devices" }, async (params) => {
    const result = await _getDevices(resources, params);
    return { content: [{ type: "text", text: result }] };
  });

  server.tool(
    "get-device-data",
    `
    Get data from a device by its ID.

    For queries 'min', 'max', 'count', 'avg', and 'sum', if the requested period exceeds one month,
    the request must be split into parts, each covering a maximum interval of one month.
    `,
    deviceDataModel,
    { title: "Get Device Data" },
    async (params) => {
      const { deviceID, ...queryParams } = params;
      const result = await _getDeviceData(resources, deviceID, queryParams as DataQuery);
      return { content: [{ type: "text", text: result }] };
    }
  );

  server.tool("get-device-by-id", "Get a device by its ID", genericIDModel, { title: "Get a device by its ID" }, async (params) => {
    const result = await _getDeviceByID(resources, params.id);
    return { content: [{ type: "text", text: result }] };
  });

  server.tool("get-device-cfg-by-id", "Get the configuration parameters of a device by its ID", genericIDModel, { title: "Get Device Parameters by ID" }, async (params) => {
    const result = await _getDeviceCFGByID(resources, params.id);
    return { content: [{ type: "text", text: result }] };
  });

  server.tool("get-device-data-amount-by-id", "Get the amount of data of a device by its ID", genericIDModel, { title: "Get Device Data Amount by ID" }, async (params) => {
    const result = await _getDeviceDataAmountByID(resources, params.id);
    return { content: [{ type: "text", text: result }] };
  });
}

export { handlerDevicesTools };
