import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { describeErrorSafely } from "../../../utils/safe-error";
import { IToolConfig, ServerContext } from "../../types";

const configureDeviceSchema = {
  device_id: resourceIdSchema("device ID"),
  configuration_params: z
    .array(
      z.object({
        id: z.string().describe("Existing parameter ID (update). Omit to create a new parameter.").optional(),
        sent: z.boolean().describe("Whether the parameter was already sent to the device."),
        key: z.string().describe("Parameter key."),
        value: z.string().describe("Parameter value."),
      })
    )
    .min(1, "At least one configuration parameter is required")
    .describe("Parameters to create (no id) or update (with id)."),
};

type ConfigureDeviceParams = z.infer<z.ZodObject<typeof configureDeviceSchema>>;

async function configureDeviceTool(context: ServerContext, params: ConfigureDeviceParams): Promise<string> {
  const results: Array<Record<string, unknown>> = [];

  for (const param of params.configuration_params) {
    const outcome = await context.resources.devices
      .paramSet(params.device_id, { id: param.id, sent: param.sent, key: param.key, value: param.value })
      .then(() => ({ operation: param.id ? "updated" : "created", parameter: param.key }))
      .catch((error) => ({ operation: "failed", parameter: param.key, error: describeErrorSafely(error, [context.token]) }));
    results.push(outcome);
  }

  return convertJSONToMarkdown(results);
}

const configureDeviceConfigJSON: IToolConfig = {
  name: "configure_device",
  description: `Creates or updates configuration parameters on a device. Parameters with an id are updated; parameters without one are created. Each parameter is applied independently and per-parameter failures are reported.

Use for device settings delivered as key/value parameters (e.g. reporting intervals, dashboard URLs), not for the device's own properties (update_device) or sensor data (send_device_data).

<example>
{"device_id": "61f0000000000000000d0001", "configuration_params": [{"key": "dashboard_url", "value": "https://admin.tago.io", "sent": true}]}
</example>`,
  parameters: configureDeviceSchema,
  title: "Configure Device Parameters",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: configureDeviceTool,
};

export { configureDeviceConfigJSON };
