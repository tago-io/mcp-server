import { z } from "zod/v3";

import { getProfileID } from "../../../utils/get-profile-id";
import { tagsObjectModel } from "../../../utils/global-params.model";
import { pickDefined } from "../../../utils/pick-defined";
import { invalidParamMessage } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { arrangementSchema, BLUEPRINT_FIELDS, blueprintFieldsSchema, DASHBOARD_SCHEMA_HINT, tabsSchema } from "../dashboard-schemas";
import { formatValidationIssues, validateDashboardCreate } from "../validation-adapter";

const createDashboardBaseSchema = z.object({
  label: z.string().min(1).describe("The label (display name) for the dashboard."),
  tabs: tabsSchema.optional(),
  arrangement: arrangementSchema.optional(),
  tags: z.array(tagsObjectModel).describe("The tags for the dashboard. E.g: [{ key: 'team', value: 'ops' }]").optional(),
  visible: z.boolean().describe("Whether the dashboard is visible in the sidebar. Defaults to true.").optional(),
  type: z
    .enum(["dashboard", "blueprint"])
    .describe('"blueprint" creates a dashboard whose widgets bind to slots the viewer picks at runtime. Defaults to "dashboard". Cannot be changed later.')
    .optional(),
  ...blueprintFieldsSchema,
});

type CreateDashboardSchema = z.infer<typeof createDashboardBaseSchema>;

const createDashboardCrossField = z.any().superRefine((value, ctx) => {
  const params = (value ?? {}) as Record<string, unknown>;
  const blueprintField = BLUEPRINT_FIELDS.find((field) => params[field] !== undefined);
  if (blueprintField && params.type !== "blueprint") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: invalidParamMessage(
        blueprintField,
        'requires type "blueprint"; blueprint fields have no effect on a regular dashboard',
        '{ "label": "Fleet", "type": "blueprint" }'
      ),
    });
  }
});

// Schema-valid stand-in used only for the profile-independent validation pass;
// it never reaches an outbound payload (the profile is stripped either way).
const PLACEHOLDER_PROFILE_ID = "0".repeat(24);

async function createDashboardTool(context: ServerContext, params: CreateDashboardSchema): Promise<string> {
  const candidate: Record<string, unknown> = pickDefined(params);

  // Invalid configurations must fail before ANY SDK traffic, including the
  // profile lookup, so validation runs first with a placeholder profile.
  const localResult = validateDashboardCreate(candidate, PLACEHOLDER_PROFILE_ID);
  if (!localResult.ok) {
    throw new Error(formatValidationIssues(localResult.issues, DASHBOARD_SCHEMA_HINT));
  }

  const profileId = await getProfileID(context.resources);
  const result = validateDashboardCreate(candidate, profileId);
  if (!result.ok) {
    throw new Error(formatValidationIssues(result.issues, DASHBOARD_SCHEMA_HINT));
  }

  const created = await context.resources.dashboards.create(result.sanitized as never);
  return `Dashboard created with ID \`${created.dashboard}\`. Add widgets with create_widget, then place them by sending the complete arrangement via update_dashboard.`;
}

const createDashboardConfigJSON: IToolConfig = {
  name: "create_dashboard",
  description: `Creates a new dashboard in the TagoIO profile.

Use this when the user wants a new dashboard. The dashboard starts empty; add widgets with create_widget afterwards, then place them by sending the complete arrangement via update_dashboard. Tab keys must be unique. The input is validated against the official dashboard schema before any request is sent.

<example>
{
  "label": "Fleet Overview",
  "tabs": [{ "key": "overview", "value": "Overview" }],
  "tags": [{ "key": "team", "value": "ops" }]
}
</example>

<example>
{
  "label": "Organizations",
  "type": "blueprint",
  "blueprint_devices": [{ "name": "organization", "type": "entity", "conditions": [{ "key": "entity_type", "value": "organization" }] }]
}
</example>

A blueprint dashboard's widgets bind to its slots (\`blueprint_devices\`); a slot of type "entity" lists the entities whose tags match its \`conditions\`. Read the assigned slot IDs with get_dashboard before binding widgets to them.

Key limitations: widgets are not created here; arrangement entries reference widget IDs that must already exist; the dashboard type cannot be changed after creation.`,
  parameters: createDashboardBaseSchema.shape,
  title: "Create Dashboard",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: createDashboardCrossField,
  tool: createDashboardTool,
};

export { createDashboardConfigJSON };
