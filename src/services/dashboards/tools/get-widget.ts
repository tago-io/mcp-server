import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { stripTokenFields } from "../../../utils/strip-token-fields";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const getWidgetSchemaShape = {
  dashboard_id: resourceIdSchema("dashboard ID"),
  widget_id: resourceIdSchema("widget ID"),
  response_format: responseFormatSchema,
};

type GetWidgetParams = z.infer<z.ZodObject<typeof getWidgetSchemaShape>>;

async function getWidgetTool(context: ServerContext, params: GetWidgetParams): Promise<string> {
  const widget = (await context.resources.dashboards.widgets.info(params.dashboard_id, params.widget_id)) as unknown as Record<string, unknown>;
  // Complete widget objects can carry an authentication `token` field;
  // strip capability fields recursively so detailed rendering never exposes it.
  return renderItem(stripTokenFields(widget) as Record<string, unknown>, ["id", "label", "type", "realtime"], params.response_format);
}

const getWidgetConfigJSON: IToolConfig = {
  name: "get_widget",
  description: `Fetches one widget from a dashboard by ID. The concise view shows identity fields; use response_format "detailed" for the full configuration (type, label, display, data sources).

Use when you need a widget's current configuration, before patching it with update_widget or as a reference for building a similar widget; pass response_format "detailed" for those workflows. The widget's position on the dashboard lives in the dashboard arrangement (get_dashboard), not here.

<example>
{"dashboard_id": "61f0000000000000000da001", "widget_id": "61f0000000000000000db001"}
</example>`,
  parameters: getWidgetSchemaShape,
  title: "Get Widget",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getWidgetTool,
};

export { getWidgetConfigJSON };
