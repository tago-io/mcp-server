import type { NetworkQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { amountSchema, pageSchema, responseFormatSchema, wildcardFilter } from "../../../utils/global-params.model";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const NETWORK_FIELDS = [
  "id",
  "name",
  "description",
  "logo_url",
  "icon_url",
  "banner_url",
  "public",
  "device_parameters",
  "middleware_endpoint",
  "payload_encoder",
  "payload_decoder",
  "documentation_url",
  "serial_number",
  "require_devices_access",
] as const;
const DEFAULT_FIELDS = ["id", "name", "public"] as const;
const DEFAULT_AMOUNT = 10;
const MAX_AMOUNT = 50;

const searchNetworksBaseSchema = z.object({
  name: z.string().min(1).describe("Full or partial network name to match (wildcard search).").optional(),
  public: z.boolean().describe("Filter by visibility: true for public networks, false for the profile's private networks.").optional(),
  page: pageSchema,
  amount: amountSchema(MAX_AMOUNT, DEFAULT_AMOUNT),
  fields: z
    .array(z.enum(NETWORK_FIELDS))
    .describe(
      `Fields to include per network. Defaults to: ${DEFAULT_FIELDS.join(", ")}. Also controls the rendered columns: when supplied, output shows exactly these fields, even in concise mode.`
    )
    .optional(),
  response_format: responseFormatSchema,
});

type SearchNetworksSchema = z.infer<typeof searchNetworksBaseSchema>;

async function searchNetworksTool(context: ServerContext, params: SearchNetworksSchema): Promise<string> {
  const requestedAmount = params.amount ?? DEFAULT_AMOUNT;

  // name and public must land in the same filter object (assigning one
  // used to replace the whole filter and silently drop the other).
  let filter: NetworkQuery["filter"];
  if (params.name !== undefined) {
    filter = { ...filter, name: params.name };
  }
  if (params.public !== undefined) {
    filter = { ...filter, public: params.public };
  }

  const query: NetworkQuery = {
    amount: requestedAmount,
    page: params.page,
    fields: (params.fields ?? [...DEFAULT_FIELDS]) as NetworkQuery["fields"],
    filter: wildcardFilter(filter, ["name"]),
  };

  const networks = await context.resources.integration.networks.list(query);

  return renderList({
    items: networks as unknown as Record<string, unknown>[],
    conciseFields: ["id", "name", "public"],
    selectedFields: params.fields,
    responseFormat: params.response_format,
    requestedAmount,
    page: params.page,
    resourceLabel: "networks",
    emptyHint: "Try a shorter name fragment, or remove the public filter.",
  });
}

const searchNetworksConfigJSON: IToolConfig = {
  name: "search_networks",
  description: `Searches TagoIO networks (the transport/protocol integrations devices connect through, such as LoRaWAN carriers, MQTT, and HTTP) by name and/or visibility. Use when resolving which network a device should use, e.g. when create_device reports a connector supporting multiple networks and needs an explicit network choice.

The name filter matches partially (wildcard), so search for the protocol or carrier fragment ("lorawan", "mqtt"). Results are capped at ${MAX_AMOUNT} per call. This tool cannot read or upload a network's payload parser code.

<example>
{"name": "lorawan", "public": true, "amount": 10}
</example>`,
  parameters: searchNetworksBaseSchema.shape,
  title: "Search Networks",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: searchNetworksTool,
};

export { searchNetworksBaseSchema, searchNetworksConfigJSON };
