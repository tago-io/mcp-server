import { z } from "zod/v3";

import { requireAtLeastOne } from "../../../utils/cross-field";
import { resourceIdSchema, tagsObjectModel } from "../../../utils/global-params.model";
import { pickDefined } from "../../../utils/pick-defined";
import { invalidParamError } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { arrangementSchema, BLUEPRINT_FIELDS, blueprintFieldsSchema, DASHBOARD_SCHEMA_HINT, tabsSchema } from "../dashboard-schemas";
import { formatValidationIssues, validateDashboardUpdate } from "../validation-adapter";

const updateDashboardBaseSchema = z.object({
  dashboard_id: resourceIdSchema("dashboard ID"),
  label: z.string().min(1).describe("The new label for the dashboard.").optional(),
  tabs: tabsSchema.optional(),
  arrangement: arrangementSchema.optional(),
  tags: z.array(tagsObjectModel).describe("The new tags for the dashboard, replacing the current ones.").optional(),
  visible: z.boolean().describe("Show or hide the dashboard in the sidebar.").optional(),
  ...blueprintFieldsSchema,
});

type UpdateDashboardSchema = z.infer<typeof updateDashboardBaseSchema>;

const UPDATABLE_FIELDS = ["label", "tabs", "arrangement", "tags", "visible", ...BLUEPRINT_FIELDS];

const updateDashboardCrossField = requireAtLeastOne(
  UPDATABLE_FIELDS,
  "dashboard_id",
  "at least one field to update must be provided alongside it",
  '{ "dashboard_id": "61f0000000000000000da001", "label": "New label" }'
);

async function updateDashboardTool(context: ServerContext, params: UpdateDashboardSchema): Promise<string> {
  const { dashboard_id: dashboardID, ...fields } = params;
  const patch: Record<string, unknown> = pickDefined(fields);

  const current = { ...(await context.resources.dashboards.info(dashboardID)) } as unknown as Record<string, unknown>;
  const blueprintField = BLUEPRINT_FIELDS.find((field) => patch[field] !== undefined);
  if (blueprintField && current.type !== "blueprint") {
    throw invalidParamError(
      blueprintField,
      'only applies to blueprint dashboards; this dashboard is not one. Create a blueprint dashboard with create_dashboard and type "blueprint"',
      '{ "label": "Fleet", "type": "blueprint" }'
    );
  }
  const result = validateDashboardUpdate(current, patch);
  if (!result.ok) {
    throw new Error(formatValidationIssues(result.issues, DASHBOARD_SCHEMA_HINT));
  }

  // Controlled local confirmation: the SDK success text is server-provided
  // and may echo submitted values, so it never reaches the result.
  await context.resources.dashboards.edit(dashboardID, result.sanitizedPatch as never);
  return `Dashboard \`${dashboardID}\` updated.`;
}

const updateDashboardConfigJSON: IToolConfig = {
  name: "update_dashboard",
  description: `Updates an existing TagoIO dashboard by ID. Only the provided fields are changed; \`tabs\`, \`tags\`, and \`arrangement\` replace the current sets entirely when provided.

This tool owns widget placement: \`arrangement\` is the full placement grid and replaces atomically. To place or unplace a widget, first read the current arrangement with get_dashboard, then send the COMPLETE desired arrangement, including every existing entry you want to keep. Widget configuration (label, display, data) is changed with update_widget, never here.

On a blueprint dashboard, \`blueprint_devices\` holds the slots widgets bind to. A slot of type "entity" lists the entities whose tags match its \`conditions\`; \`filter_conditions\` makes one slot follow another. The array replaces the current slots: resend every slot to keep exactly as get_dashboard returned it, including its \`id\`, and omit \`id\` only for new slots. Bind a widget to a slot with update_widget, using the slot ID as the data source.

<example>
{
  "dashboard_id": "61f0000000000000000da001",
  "arrangement": [{ "widget_id": "61f0000000000000000db001", "x": 0, "y": 0, "width": 4, "height": 2 }]
}
</example>

<example>
{
  "dashboard_id": "61f0000000000000000da001",
  "blueprint_devices": [
    { "id": "61f0000000000000000bb001", "name": "organization", "type": "entity", "conditions": [{ "key": "entity_type", "value": "organization" }] },
    { "name": "user_profile", "type": "entity", "conditions": [{ "key": "entity_type", "value": "user_profile" }], "filter_conditions": [{ "type": "tag_match", "tag_key": "organization_id", "blueprint_device": "organization" }] }
  ]
}
</example>

Key limitations: at least one editable field must be provided; blueprint fields apply only to blueprint dashboards; an arrangement omitting an existing entry unplaces that widget; the patch is validated against the official dashboard schema before any change is sent.`,
  parameters: updateDashboardBaseSchema.shape,
  title: "Update Dashboard",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: updateDashboardCrossField,
  tool: updateDashboardTool,
};

export { updateDashboardConfigJSON };
