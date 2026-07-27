import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const getDeviceSchema = {
  device_id: resourceIdSchema("device ID"),
  include_data_amount: z.boolean().describe("Also fetch the number of data records stored on the device.").optional(),
  include_configuration_params: z.boolean().describe("Also fetch the device's configuration parameters.").optional(),
  response_format: responseFormatSchema,
};

type GetDeviceParams = z.infer<z.ZodObject<typeof getDeviceSchema>>;

async function getDeviceTool(context: ServerContext, params: GetDeviceParams): Promise<string> {
  const { resources } = context;
  const device = (await resources.devices.info(params.device_id)) as unknown as Record<string, unknown>;

  if (params.include_data_amount) {
    device.data_amount = await resources.devices.amount(params.device_id);
  }
  if (params.include_configuration_params) {
    device.configuration_params = await resources.devices.paramList(params.device_id);
  }

  return renderItem(
    device,
    ["id", "name", "type", "active", "connector", "network", "tags", "created_at", "last_input", "data_amount", "configuration_params"],
    params.response_format
  );
}

const getDeviceConfigJSON: IToolConfig = {
  name: "get_device",
  description: `Fetches one device by ID, optionally with its stored-data count and configuration parameters.

Use when you already know the device ID (from search_devices) and need its details, its data volume, or its configuration parameters. Not for reading sensor data; use read_device_data for that.

<example>
{"device_id": "61f0000000000000000d0001", "include_configuration_params": true}
</example>`,
  parameters: getDeviceSchema,
  title: "Get Device",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getDeviceTool,
};

export { getDeviceConfigJSON };
