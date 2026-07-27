import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { IToolConfig, ServerContext } from "../../types";
import { createDeviceDataHandler, dataFilterShape } from "./device-data-query";

const deleteDeviceDataSchema = {
  device_id: resourceIdSchema("device ID"),
  ...dataFilterShape,
};

type DeleteDeviceDataParams = z.infer<z.ZodObject<typeof deleteDeviceDataSchema>>;

async function deleteDeviceDataTool(context: ServerContext, params: DeleteDeviceDataParams): Promise<string> {
  const { device_id, ...query } = params;
  const handler = createDeviceDataHandler(context);
  const result = await handler.remove(device_id, query as never);
  return convertJSONToMarkdown(result);
}

const deleteDeviceDataConfigJSON: IToolConfig = {
  name: "delete_device_data",
  description: `Permanently deletes data records from a mutable device, filtered by variables, groups, IDs, values, or date range.

Use only when the user explicitly asks to remove stored data. Deletion cannot be undone and fails on immutable devices. The qty filter applies per variable: qty 2 with two variables deletes up to 2 records from each.

<example>
{"device_id": "61f0000000000000000d0001", "variables": ["humidity"], "qty": 100}
</example>`,
  parameters: deleteDeviceDataSchema,
  title: "Delete Device Data",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteDeviceDataTool,
};

export { deleteDeviceDataConfigJSON };
