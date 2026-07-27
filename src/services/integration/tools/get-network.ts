import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const getNetworkBaseSchema = z.object({
  network_id: resourceIdSchema("network ID"),
  response_format: responseFormatSchema,
});

type GetNetworkSchema = z.infer<typeof getNetworkBaseSchema>;

async function getNetworkTool(context: ServerContext, params: GetNetworkSchema): Promise<string> {
  // The SDK defaults this call's fields to ["id", "name"]; request the useful
  // metadata explicitly, leaving out the payload encoder/decoder code blobs.
  const network = await context.resources.integration.networks.info(params.network_id, [
    "id",
    "name",
    "public",
    "description",
    "device_parameters",
    "middleware_endpoint",
    "serial_number",
    "documentation_url",
  ]);

  return renderItem(network as unknown as Record<string, unknown>, ["id", "name", "public"], params.response_format);
}

const getNetworkConfigJSON: IToolConfig = {
  name: "get_network",
  description: `Fetches a single TagoIO network (transport/protocol integration such as a LoRaWAN carrier, MQTT, or HTTP) by its 24-character ID. Use when you have a network ID (from search_networks or a connector's networks list) and need its details, such as the middleware endpoint or serial-number format devices register with. To find a network by name instead, use search_networks.

The response does not include the network's payload encoder/decoder source code.

<example>
{"network_id": "61f0000000000000000e0001"}
</example>`,
  parameters: getNetworkBaseSchema.shape,
  title: "Get Network",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getNetworkTool,
};

export { getNetworkBaseSchema, getNetworkConfigJSON };
