import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { stripTokenFields } from "../../../utils/strip-token-fields";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";
import { BLUEPRINT_FIELDS } from "../dashboard-schemas";

const getDashboardSchema = {
  dashboard_id: resourceIdSchema("dashboard ID"),
  response_format: responseFormatSchema,
};

type GetDashboardParams = z.infer<z.ZodObject<typeof getDashboardSchema>>;

const CONCISE_FIELDS = ["id", "label", "type", "visible", "tabs", "arrangement", "tags", "created_at", "updated_at"];

// Slot IDs are what widgets bind to and what update_dashboard needs to keep a
// slot, so a blueprint dashboard shows its slots even in the concise view.
const BLUEPRINT_CONCISE_FIELDS = [...CONCISE_FIELDS, ...BLUEPRINT_FIELDS];

async function getDashboardTool(context: ServerContext, params: GetDashboardParams): Promise<string> {
  const dashboard = (await context.resources.dashboards.info(params.dashboard_id)) as unknown as Record<string, unknown>;
  // Dashboard responses can carry capability token fields (e.g. on shared
  // dashboards); strip them recursively before any rendering.
  return renderItem(stripTokenFields(dashboard) as Record<string, unknown>, dashboard.type === "blueprint" ? BLUEPRINT_CONCISE_FIELDS : CONCISE_FIELDS, params.response_format);
}

const getDashboardConfigJSON: IToolConfig = {
  name: "get_dashboard",
  description: `Fetches one dashboard by ID with its configuration, tabs, and widget arrangement.

Use when you already know the dashboard ID (from search_dashboards) and need its details, especially the arrangement (widget placement grid) before placing or unplacing widgets via update_dashboard. On a blueprint dashboard it also shows the slots (\`blueprint_devices\`) with their IDs, which widgets bind to. Widget configurations themselves are fetched with get_widget.

<example>
{"dashboard_id": "61f0000000000000000da001"}
</example>`,
  parameters: getDashboardSchema,
  title: "Get Dashboard",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getDashboardTool,
};

export { getDashboardConfigJSON };
