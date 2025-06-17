import { Resources } from "@tago-io/sdk";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { IDeviceToolConfig } from "../../types";
import { genericIDSchema } from "../../../utils/global-params.model";

/**
 * @description Get the configuration parameters of a device by its ID and returns a Markdown-formatted response.
 */
async function deviceParamListTool(resources: Resources, deviceID: string) {
  const device = await resources.devices.paramList(deviceID).catch((error) => {
    throw `**Error to get device CFG by ID:** ${error}`;
  });

  const markdownResponse = convertJSONToMarkdown(device);

  return markdownResponse;
}

const deviceParamListConfigJSON: IDeviceToolConfig = {
  name: "get-device-param-list",
  description: "Get the configuration parameters of a device by its ID",
  parameters: genericIDSchema.shape,
  title: "Get Device Parameter List",
  tool: deviceParamListTool,
};

export { deviceParamListConfigJSON };
