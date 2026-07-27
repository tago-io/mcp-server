import type { DeviceQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { amountSchema, pageSchema, responseFormatSchema, tagsObjectModel, wildcardFilter } from "../../../utils/global-params.model";
import { parseOrderBy } from "../../../utils/order-by";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const DEFAULT_FIELDS = ["id", "active", "name", "tags", "connector", "network", "type", "created_at", "updated_at"] as const;
const ORDER_FIELDS = ["name", "visible", "active", "last_input", "created_at", "updated_at"] as const;
const DEFAULT_AMOUNT = 20;

const searchDevicesSchema = {
  filter: z
    .object({
      id: z.string().length(24, "Device ID must be 24 characters long").describe("Exact device ID.").optional(),
      name: z.string().describe("Partial device name. Wildcard matching is applied automatically ('sensor' finds 'Temperature Sensor').").optional(),
      active: z.boolean().describe("Filter by active status.").optional(),
      connector: z.string().length(24, "Connector ID must be 24 characters long").describe("Filter by connector ID.").optional(),
      network: z.string().length(24, "Network ID must be 24 characters long").describe("Filter by network ID.").optional(),
      type: z.enum(["mutable", "immutable"]).describe("Filter by storage type.").optional(),
      tags: z.array(tagsObjectModel.partial()).describe("Filter by tags. E.g: [{ key: 'device_type', value: 'sensor' }]").optional(),
      updated_at: z.string().describe("Filter by update date. E.g: '2026-01-01'").optional(),
      created_at: z.string().describe("Filter by creation date. E.g: '2026-01-01'").optional(),
      orderBy: z
        .string()
        .describe(`Sort as "field,direction". Field is one of: ${ORDER_FIELDS.join(", ")}; direction is asc or desc. E.g: "name,asc"`)
        .optional(),
    })
    .describe("Filters to narrow the search.")
    .optional(),
  page: pageSchema,
  amount: amountSchema(200, DEFAULT_AMOUNT),
  fields: z
    .array(z.enum(DEFAULT_FIELDS))
    .describe(
      "Fields to include per device. Defaults to all key fields. Also controls the rendered columns: when supplied, output shows exactly these fields, even in concise mode."
    )
    .optional(),
  response_format: responseFormatSchema,
};

type SearchDevicesParams = z.infer<z.ZodObject<typeof searchDevicesSchema>>;

async function searchDevicesTool(context: ServerContext, params: SearchDevicesParams): Promise<string> {
  const amount = params.amount ?? DEFAULT_AMOUNT;
  const query: DeviceQuery = {
    amount,
    page: params.page,
    fields: (params.fields ?? [...DEFAULT_FIELDS]) as DeviceQuery["fields"],
  };
  if (params.filter) {
    const { orderBy, ...filterFields } = params.filter;
    query.filter = wildcardFilter(filterFields, ["name"]) as DeviceQuery["filter"];
    if (orderBy) {
      query.orderBy = parseOrderBy(orderBy, ORDER_FIELDS);
    }
  }

  const devices = await context.resources.devices.list(query);
  return renderList({
    items: devices as unknown as Record<string, unknown>[],
    conciseFields: ["id", "name", "type", "active", "connector", "network"],
    selectedFields: params.fields,
    responseFormat: params.response_format,
    requestedAmount: amount,
    page: params.page,
    resourceLabel: "devices",
    emptyHint: "Broaden the name filter (wildcards are automatic) or drop filters. Use create_device to provision a new device.",
  });
}

const searchDevicesConfigJSON: IToolConfig = {
  name: "search_devices",
  description: `Searches the devices in the TagoIO account by name, tags, connector, network, type, or activity.

Use when you need to find devices, list what exists, or resolve a device name to its ID before calling get_device, update_device, or the device-data tools. Name filtering is wildcard-based, so partial names work. Returns a concise table by default; a full page means more results may exist (paginate or narrow).

<example>
{"filter": {"name": "sensor", "tags": [{"key": "device_type", "value": "sensor"}]}, "amount": 20}
</example>`,
  parameters: searchDevicesSchema,
  title: "Search Devices",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: searchDevicesTool,
};

export { searchDevicesConfigJSON };
