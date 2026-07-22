import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { IToolConfig, ServerContext } from "../../types";
import { createDeviceDataHandler } from "./device-data-query";

const locationSchema = z.object({
  lat: z.number().describe("Latitude."),
  lng: z.number().describe("Longitude."),
});

const editDeviceDataSchema = {
  device_id: resourceIdSchema("device ID"),
  data: z
    .array(
      z.object({
        id: z.string().describe("ID of the existing data record to edit (from read_device_data)."),
        value: z.union([z.string(), z.number(), z.boolean()]).describe("New value.").optional(),
        unit: z.string().describe("New unit.").optional(),
        group: z.string().describe("New group.").optional(),
        location: z.union([locationSchema, z.null()]).describe("New coordinates.").optional(),
        metadata: z.record(z.any()).describe("New metadata object.").optional(),
        time: z.string().describe("New ISO 8601 timestamp.").optional(),
      })
    )
    .min(1, "At least one data edit is required")
    .describe("Edits to apply; each entry targets one record by ID."),
};

type EditDeviceDataParams = z.infer<z.ZodObject<typeof editDeviceDataSchema>>;

async function editDeviceDataTool(context: ServerContext, params: EditDeviceDataParams): Promise<string> {
  const handler = createDeviceDataHandler(context);
  const result = await handler.edit(params.device_id, params.data);
  return convertJSONToMarkdown(result);
}

const editDeviceDataConfigJSON: IToolConfig = {
  name: "edit_device_data",
  description: `Overwrites fields of existing data records on a mutable device. The previous values are lost; this is an in-place, irreversible replacement.

Use to correct stored records (wrong unit, value, or timestamp). Requires the record IDs from read_device_data. Fails on immutable devices, whose records cannot be modified.

<example>
{"device_id": "61f0000000000000000d0001", "data": [{"id": "61f0000000000000000dd001", "unit": "°F"}]}
</example>`,
  parameters: editDeviceDataSchema,
  title: "Edit Device Data",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: editDeviceDataTool,
};

export { editDeviceDataConfigJSON };
