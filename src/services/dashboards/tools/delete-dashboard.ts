import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";

const deleteDashboardBaseSchema = z.object({
  dashboard_id: resourceIdSchema("dashboard ID"),
});

type DeleteDashboardSchema = z.infer<typeof deleteDashboardBaseSchema>;

async function deleteDashboardTool(context: ServerContext, params: DeleteDashboardSchema): Promise<string> {
  await context.resources.dashboards.delete(params.dashboard_id);
  return `Dashboard \`${params.dashboard_id}\` permanently deleted, including every widget on it.`;
}

const deleteDashboardConfigJSON: IToolConfig = {
  name: "delete_dashboard",
  description: `Permanently deletes a TagoIO dashboard by ID. The dashboard and every widget on it are permanently removed and cannot be recovered.

Use this only when the user explicitly asks to remove a dashboard. Confirm the target with get_dashboard or search_dashboards first if there is any ambiguity about which dashboard is meant.

<example>
{ "dashboard_id": "61f0000000000000000da001" }
</example>

Key limitations: deletion cannot be undone; all widgets on the dashboard are removed with it; shared or public links to the dashboard stop working.`,
  parameters: deleteDashboardBaseSchema.shape,
  title: "Delete Dashboard",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteDashboardTool,
};

export { deleteDashboardConfigJSON };
