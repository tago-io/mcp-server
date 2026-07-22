import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";

const deleteWidgetBaseSchema = z.object({
  dashboard_id: resourceIdSchema("dashboard ID"),
  widget_id: resourceIdSchema("widget ID"),
});

type DeleteWidgetSchema = z.infer<typeof deleteWidgetBaseSchema>;

function isPlacedInArrangement(arrangement: unknown, widgetId: string): boolean {
  if (!Array.isArray(arrangement)) {
    return false;
  }
  return arrangement.some((entry) => typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).widget_id === widgetId);
}

async function deleteWidgetTool(context: ServerContext, params: DeleteWidgetSchema): Promise<string> {
  // Never delete a widget the dashboard arrangement still references; a stale
  // entry leaves a broken placeholder on the dashboard.
  const dashboard = (await context.resources.dashboards.info(params.dashboard_id)) as unknown as Record<string, unknown>;
  if (isPlacedInArrangement(dashboard.arrangement, params.widget_id)) {
    throw new Error(
      `Widget \`${params.widget_id}\` is still placed on dashboard \`${params.dashboard_id}\`'s arrangement. Unplace it first via update_dashboard: send the complete current arrangement minus this widget's entry (keep every other entry unchanged), then retry delete_widget.`
    );
  }

  await context.resources.dashboards.widgets.delete(params.dashboard_id, params.widget_id);
  return `Widget \`${params.widget_id}\` permanently deleted from dashboard \`${params.dashboard_id}\`.`;
}

const deleteWidgetConfigJSON: IToolConfig = {
  name: "delete_widget",
  description: `Permanently deletes a widget from a TagoIO dashboard. The widget and its configuration are permanently removed and cannot be recovered.

The widget must be unplaced first: if the dashboard arrangement still references it, this tool refuses without deleting; remove the widget's arrangement entry via update_dashboard (sending the complete arrangement without it), then retry.

<example>
{ "dashboard_id": "61f0000000000000000da001", "widget_id": "61f0000000000000000db001" }
</example>

Key limitations: deletion cannot be undone; the placement check reads the dashboard before any delete is issued.`,
  parameters: deleteWidgetBaseSchema.shape,
  title: "Delete Widget",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteWidgetTool,
};

export { deleteWidgetConfigJSON };
