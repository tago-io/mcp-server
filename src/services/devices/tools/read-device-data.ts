import type { DataQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";
import { DeviceDataReadQuery, createDeviceDataHandler, readQueryShape, validateReadQuery } from "./device-data-query";

const readDeviceDataSchema = {
  device_id: resourceIdSchema("device ID"),
  ...readQueryShape,
  response_format: responseFormatSchema,
};

type ReadDeviceDataParams = z.infer<z.ZodObject<typeof readDeviceDataSchema>>;

const readDeviceDataCrossField = z.any().superRefine((value, ctx) => {
  try {
    validateReadQuery((value ?? {}) as DeviceDataReadQuery);
  } catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : String(error) });
  }
});

async function readDeviceDataTool(context: ServerContext, params: ReadDeviceDataParams): Promise<string> {
  const { device_id, response_format, ...query } = params;

  const handler = createDeviceDataHandler(context);
  const result = await handler.read(device_id, query as unknown as DataQuery);

  if (!Array.isArray(result)) {
    // Aggregations (min/max/count/avg/sum) return scalars or summary objects.
    return convertJSONToMarkdown(result);
  }

  return renderList({
    items: result as Record<string, unknown>[],
    conciseFields: ["variable", "value", "unit", "time", "group", "id"],
    responseFormat: response_format,
    requestedAmount: params.qty ?? 15,
    resourceLabel: "data records",
    emptyHint: "Widen the date range or drop variable filters. Data reads count against the profile's Data Output limit.",
  });
}

const readDeviceDataConfigJSON: IToolConfig = {
  name: "read_device_data",
  description: `Reads data records stored on a device: paged listings, first/last records, and computed aggregations (min/max/count/avg/sum, time-bucketed aggregates, conditional filters).

Use to answer questions about measured values. Keep queries narrow (variables + date range); every record read counts against the profile's Data Output limit. avg/sum and conditional queries require start_date, and computation periods must not exceed one month; interval/function/value only apply to aggregate/conditional queries.

<example>
{"device_id": "61f0000000000000000d0001", "query": "avg", "variables": ["temperature"], "start_date": "2026-06-01T00:00:00Z", "end_date": "2026-06-30T23:59:59Z"}
</example>`,
  parameters: readDeviceDataSchema,
  title: "Read Device Data",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  crossFieldSchema: readDeviceDataCrossField,
  tool: readDeviceDataTool,
};

export { readDeviceDataConfigJSON };
