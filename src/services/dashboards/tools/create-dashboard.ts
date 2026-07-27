import { z } from "zod/v3";

import { getProfileID } from "../../../utils/get-profile-id";
import { tagsObjectModel } from "../../../utils/global-params.model";
import { IToolConfig, ServerContext } from "../../types";
import { arrangementSchema, DASHBOARD_SCHEMA_HINT, tabsSchema } from "../dashboard-schemas";
import { formatValidationIssues, validateDashboardCreate } from "../validation-adapter";

const createDashboardBaseSchema = z.object({
  label: z.string().min(1).describe("The label (display name) for the dashboard."),
  tabs: tabsSchema.optional(),
  arrangement: arrangementSchema.optional(),
  tags: z.array(tagsObjectModel).describe("The tags for the dashboard. E.g: [{ key: 'team', value: 'ops' }]").optional(),
  visible: z.boolean().describe("Whether the dashboard is visible in the sidebar. Defaults to true.").optional(),
});

type CreateDashboardSchema = z.infer<typeof createDashboardBaseSchema>;

// Schema-valid stand-in used only for the profile-independent validation pass;
// it never reaches an outbound payload (the profile is stripped either way).
const PLACEHOLDER_PROFILE_ID = "0".repeat(24);

async function createDashboardTool(context: ServerContext, params: CreateDashboardSchema): Promise<string> {
  const candidate: Record<string, unknown> = {};
  for (const key of ["label", "tabs", "arrangement", "tags", "visible"] as const) {
    if (params[key] !== undefined) {
      candidate[key] = params[key];
    }
  }

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

Key limitations: widgets are not created here; arrangement entries reference widget IDs that must already exist.`,
  parameters: createDashboardBaseSchema.shape,
  title: "Create Dashboard",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: createDashboardTool,
};

export { createDashboardConfigJSON };
