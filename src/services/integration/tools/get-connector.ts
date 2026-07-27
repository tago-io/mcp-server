import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const getConnectorBaseSchema = z.object({
  connector_id: resourceIdSchema("connector ID"),
  response_format: responseFormatSchema,
});

type GetConnectorSchema = z.infer<typeof getConnectorBaseSchema>;

async function getConnectorTool(context: ServerContext, params: GetConnectorSchema): Promise<string> {
  const connector = await context.resources.integration.connectors.info(params.connector_id, ["id", "name", "networks", "public", "description", "device_parameters"]);

  return renderItem(connector as unknown as Record<string, unknown>, ["id", "name", "public", "networks"], params.response_format);
}

const getConnectorConfigJSON: IToolConfig = {
  name: "get_connector",
  description: `Fetches a single TagoIO connector (pre-built payload decoder for a device vendor/model) by its 24-character ID. Use when you already have a connector ID (from search_connectors or an existing device) and need its details, especially the networks it supports before calling create_device. To find a connector by name instead, use search_connectors.

The response does not include the connector's payload parser source code.

<example>
{"connector_id": "662fa9d0d68e9d000a1cbf25"}
</example>`,
  parameters: getConnectorBaseSchema.shape,
  title: "Get Connector",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getConnectorTool,
};

export { getConnectorBaseSchema, getConnectorConfigJSON };
