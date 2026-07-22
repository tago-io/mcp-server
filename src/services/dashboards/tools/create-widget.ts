import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";
import { formatValidationIssues, validateWidgetCreate } from "../validation-adapter";

const createWidgetBaseSchema = z.object({
  dashboard_id: resourceIdSchema("dashboard ID"),
  configuration: z
    .record(z.string(), z.unknown())
    .describe('Compact widget configuration object. Must include "type", "label", and "display" as the widget schema demands (see widget_schema_lookup).'),
});

type CreateWidgetSchema = z.infer<typeof createWidgetBaseSchema>;

async function createWidgetTool(context: ServerContext, params: CreateWidgetSchema): Promise<string> {
  const result = validateWidgetCreate(params.configuration);
  if (!result.ok) {
    throw new Error(formatValidationIssues(result.issues, "widget_schema_lookup"));
  }

  const created = await context.resources.dashboards.widgets.create(params.dashboard_id, result.sanitized as never);
  return `Widget created with ID \`${created.widget}\`. It is NOT yet placed on the dashboard; add it to the dashboard arrangement via update_dashboard (read the current arrangement with get_dashboard and send the complete desired arrangement including the new entry).`;
}

const createWidgetConfigJSON: IToolConfig = {
  name: "create_widget",
  description: `Creates a new widget on a TagoIO dashboard from a compact configuration object.

Use this when the user wants a new widget (gauge, chart, card, map, ...). The configuration is validated against the official widget schema for its "type" before any request is sent; call widget_schema_lookup first for the exact schema of a type. The new widget is NOT visible until it is placed: add it to the dashboard arrangement via update_dashboard afterwards.

<example>
{
  "dashboard_id": "61f0000000000000000da001",
  "configuration": { "label": "Tank Level", "type": "gauge", "display": { "gauge_type": "solid", "numberformat": "0", "minimum": 0, "maximum": 100 } }
}
</example>

Key limitations: the widget type cannot be changed after creation; placement (x/y/size) is owned by the dashboard arrangement, not the widget.`,
  parameters: createWidgetBaseSchema.shape,
  title: "Create Widget",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: createWidgetTool,
};

export { createWidgetConfigJSON };
