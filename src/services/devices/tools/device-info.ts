import { Resources } from "@tago-io/sdk";

import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { genericIDSchema } from "../../../utils/global-params.model";

/**
 * @description Get a device information by its ID and returns a Markdown-formatted response.
 */
async function deviceInfoTool(resources: Resources, deviceID: string) {
  const device = await resources.devices.info(deviceID).catch((error) => {
    throw `**Error to get device by ID:** ${error}`;
  });

  const markdownResponse = convertJSONToMarkdown(device);

  return markdownResponse;
}

const deviceInfoConfigJSON: IDeviceToolConfig = {
  name: "get-device-info",
  description: "Get a device information by its ID",
  parameters: genericIDSchema,
  title: "Get Device Info",
  tool: deviceInfoTool,
};

export { deviceInfoConfigJSON };
