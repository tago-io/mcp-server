import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { IToolConfig, ServerContext } from "../../types";
import { createDeviceDataHandler } from "./device-data-query";

const locationSchema = z.object({
  lat: z.number().describe("Latitude."),
  lng: z.number().describe("Longitude."),
});

const sendDeviceDataSchema = {
  device_id: resourceIdSchema("device ID"),
  data: z
    .array(
      z.object({
        variable: z.string().describe("Variable name in snake_case, alphanumeric only."),
        value: z.union([z.string(), z.number(), z.boolean()]).describe("The value.").optional(),
        unit: z.string().describe("Unit of measurement, e.g. '°C'.").optional(),
        group: z.string().describe("Group ID to correlate values recorded together.").optional(),
        location: z.union([locationSchema, z.null()]).describe("Coordinates for the value.").optional(),
        metadata: z.record(z.any()).describe("Free-form metadata object.").optional(),
        time: z.string().describe("ISO 8601 timestamp. Defaults to now.").optional(),
      })
    )
    .min(1, "At least one data item is required")
    .describe("Data records to store."),
};

type SendDeviceDataParams = z.infer<z.ZodObject<typeof sendDeviceDataSchema>>;

async function sendDeviceDataTool(context: ServerContext, params: SendDeviceDataParams): Promise<string> {
  const handler = createDeviceDataHandler(context);
  const result = await handler.send(params.device_id, params.data);
  return convertJSONToMarkdown(result);
}

const sendDeviceDataConfigJSON: IToolConfig = {
  name: "send_device_data",
  description: `Stores new data records on a device (sensor readings, computed values, statuses).

Use when writing measurements or events into a device's storage. Variable names must be snake_case alphanumeric. Works on mutable and immutable devices; each stored record counts against the profile's Data Input limit.

<example>
{"device_id": "61f0000000000000000d0001", "data": [{"variable": "temperature", "value": 25.5, "unit": "°C"}]}
</example>`,
  parameters: sendDeviceDataSchema,
  title: "Send Device Data",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: sendDeviceDataTool,
};

export { sendDeviceDataConfigJSON };
