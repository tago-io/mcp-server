import { Resources } from "@tago-io/sdk";

import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { genericIDSchema } from "../../../utils/global-params.model";

/**
 * @description Get the amount of data of a device by its ID and returns a Markdown-formatted response.
 */
async function deviceDataAmountTool(resources: Resources, deviceID: string) {
  const device = await resources.devices.amount(deviceID).catch((error) => {
    throw `**Error to get device data amount by ID:** ${error}`;
  });

  const markdownResponse = convertJSONToMarkdown(device);

  return markdownResponse;
}

const deviceDataAmountConfigJSON: IDeviceToolConfig = {
  name: "get-device-data-amount",
  description: "Get the amount of data of a device by its ID",
  parameters: genericIDSchema,
  title: "Get Amount of Device Data",
  tool: deviceDataAmountTool,
};

export { deviceDataAmountConfigJSON };
