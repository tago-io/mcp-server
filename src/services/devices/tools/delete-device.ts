import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";

const deleteDeviceSchema = {
  device_id: resourceIdSchema("device ID"),
};

type DeleteDeviceParams = z.infer<z.ZodObject<typeof deleteDeviceSchema>>;

async function deleteDeviceTool(context: ServerContext, params: DeleteDeviceParams): Promise<string> {
  await context.resources.devices.delete(params.device_id);
  return `Device \`${params.device_id}\` permanently deleted, including all data stored on it.`;
}

const deleteDeviceConfigJSON: IToolConfig = {
  name: "delete_device",
  description: `Permanently deletes a device and all data stored on it. This cannot be undone.

Use only when the user explicitly asks to remove a device. To delete only the stored data, use delete_device_data instead; to deactivate without deleting, use update_device with active: false.

<example>
{"device_id": "61f0000000000000000d0001"}
</example>`,
  parameters: deleteDeviceSchema,
  title: "Delete Device",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteDeviceTool,
};

export { deleteDeviceConfigJSON };
