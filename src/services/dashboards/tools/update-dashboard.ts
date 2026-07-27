import { z } from "zod/v3";

import { requireAtLeastOne } from "../../../utils/cross-field";
import { resourceIdSchema, tagsObjectModel } from "../../../utils/global-params.model";
import { pickDefined } from "../../../utils/pick-defined";
import { IToolConfig, ServerContext } from "../../types";
import { arrangementSchema, DASHBOARD_SCHEMA_HINT, tabsSchema } from "../dashboard-schemas";
import { formatValidationIssues, validateDashboardUpdate } from "../validation-adapter";

const updateDashboardBaseSchema = z.object({
  dashboard_id: resourceIdSchema("dashboard ID"),
  label: z.string().min(1).describe("The new label for the dashboard.").optional(),
  tabs: tabsSchema.optional(),
  arrangement: arrangementSchema.optional(),
  tags: z.array(tagsObjectModel).describe("The new tags for the dashboard, replacing the current ones.").optional(),
  visible: z.boolean().describe("Show or hide the dashboard in the sidebar.").optional(),
});

type UpdateDashboardSchema = z.infer<typeof updateDashboardBaseSchema>;

const updateDashboardCrossField = requireAtLeastOne(
  ["label", "tabs", "arrangement", "tags", "visible"],
  "dashboard_id",
  "at least one field to update must be provided alongside it",
  '{ "dashboard_id": "61f0000000000000000da001", "label": "New label" }'
);

async function updateDashboardTool(context: ServerContext, params: UpdateDashboardSchema): Promise<string> {
  const patch: Record<string, unknown> = pickDefined({
    label: params.label,
    tabs: params.tabs,
    arrangement: params.arrangement,
    tags: params.tags,
    visible: params.visible,
  });

  const current = { ...(await context.resources.dashboards.info(params.dashboard_id)) } as unknown as Record<string, unknown>;
  const result = validateDashboardUpdate(current, patch);
  if (!result.ok) {
    throw new Error(formatValidationIssues(result.issues, DASHBOARD_SCHEMA_HINT));
  }

  // Controlled local confirmation: the SDK success text is server-provided
  // and may echo submitted values, so it never reaches the result.
  await context.resources.dashboards.edit(params.dashboard_id, result.sanitizedPatch as never);
  return `Dashboard \`${params.dashboard_id}\` updated.`;
}

const updateDashboardConfigJSON: IToolConfig = {
  name: "update_dashboard",
  description: `Updates an existing TagoIO dashboard by ID. Only the provided fields are changed; \`tabs\`, \`tags\`, and \`arrangement\` replace the current sets entirely when provided.

This tool owns widget placement: \`arrangement\` is the full placement grid and replaces atomically. To place or unplace a widget, first read the current arrangement with get_dashboard, then send the COMPLETE desired arrangement, including every existing entry you want to keep. Widget configuration (label, display, data) is changed with update_widget, never here.

<example>
{
  "dashboard_id": "61f0000000000000000da001",
  "arrangement": [{ "widget_id": "61f0000000000000000db001", "x": 0, "y": 0, "width": 4, "height": 2 }]
}
</example>

Key limitations: at least one editable field must be provided; an arrangement omitting an existing entry unplaces that widget; the patch is validated against the official dashboard schema before any change is sent.`,
  parameters: updateDashboardBaseSchema.shape,
  title: "Update Dashboard",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: updateDashboardCrossField,
  tool: updateDashboardTool,
};

export { updateDashboardConfigJSON };
