import type { ConnectorQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { amountSchema, pageSchema, responseFormatSchema, wildcardFilter } from "../../../utils/global-params.model";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const CONNECTOR_FIELDS = [
  "id",
  "name",
  "description",
  "logo_url",
  "public",
  "networks",
  "device_parameters",
  "payload_encoder",
  "payload_decoder",
  "install_text",
  "install_end_text",
  "device_annotation",
  "created_at",
  "updated_at",
] as const;
const DEFAULT_FIELDS = ["id", "name", "networks", "public", "device_parameters"] as const;
const DEFAULT_AMOUNT = 10;
const MAX_AMOUNT = 50;

const searchConnectorsBaseSchema = z.object({
  name: z.string().min(1).describe("Full or partial connector name to match (wildcard search).").optional(),
  public: z.boolean().describe("Filter by visibility: true for public marketplace connectors, false for the profile's private connectors.").optional(),
  page: pageSchema,
  amount: amountSchema(MAX_AMOUNT, DEFAULT_AMOUNT),
  fields: z
    .array(z.enum(CONNECTOR_FIELDS))
    .describe(
      `Fields to include per connector. Defaults to: ${DEFAULT_FIELDS.join(", ")}. Also controls the rendered columns: when supplied, output shows exactly these fields, even in concise mode.`
    )
    .optional(),
  response_format: responseFormatSchema,
});

type SearchConnectorsSchema = z.infer<typeof searchConnectorsBaseSchema>;

async function searchConnectorsTool(context: ServerContext, params: SearchConnectorsSchema): Promise<string> {
  const requestedAmount = params.amount ?? DEFAULT_AMOUNT;

  // name and public must land in the same filter object (assigning one
  // used to replace the whole filter and silently drop the other).
  let filter: ConnectorQuery["filter"];
  if (params.name !== undefined) {
    filter = { ...filter, name: params.name };
  }
  if (params.public !== undefined) {
    filter = { ...filter, public: params.public };
  }

  const query: ConnectorQuery = {
    amount: requestedAmount,
    page: params.page,
    fields: (params.fields ?? [...DEFAULT_FIELDS]) as ConnectorQuery["fields"],
    filter: wildcardFilter(filter, ["name"]),
  };

  const connectors = await context.resources.integration.connectors.list(query);

  return renderList({
    items: connectors as unknown as Record<string, unknown>[],
    // networks must stay visible in concise mode: create_device derives its
    // network from the chosen connector's networks list.
    conciseFields: ["id", "name", "public", "networks"],
    selectedFields: params.fields,
    responseFormat: params.response_format,
    requestedAmount,
    page: params.page,
    resourceLabel: "connectors",
    emptyHint: "Try a shorter name fragment, or remove the public filter.",
  });
}

const searchConnectorsConfigJSON: IToolConfig = {
  name: "search_connectors",
  description: `Searches TagoIO connectors (pre-built payload decoders for specific device vendors and models) by name and/or visibility. Use when picking a connector for create_device or checking which decoders exist for a device brand. Each result lists the connector's supported networks; create_device derives its network from that list, so note the networks of the connector you pick.

The name filter matches partially (wildcard), so search for the vendor or model fragment ("dragino", "lht65") rather than an exact title. Results are capped at ${MAX_AMOUNT} per call. This tool cannot read or upload a connector's payload parser code; use search_code_examples for parser development guidance.

<example>
{"name": "dragino", "public": true, "amount": 10}
</example>`,
  parameters: searchConnectorsBaseSchema.shape,
  title: "Search Connectors",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: searchConnectorsTool,
};

export { searchConnectorsBaseSchema, searchConnectorsConfigJSON };
