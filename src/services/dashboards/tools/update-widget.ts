import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { invalidParamMessage } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { formatValidationIssues, validateWidgetUpdate } from "../validation-adapter";

const updateWidgetBaseSchema = z.object({
  dashboard_id: resourceIdSchema("dashboard ID"),
  widget_id: resourceIdSchema("widget ID"),
  patch: z
    .record(z.string(), z.unknown())
    .describe("Partial widget configuration. Objects merge recursively, arrays replace atomically, explicit null clears a field. Send only what changes."),
});

type UpdateWidgetSchema = z.infer<typeof updateWidgetBaseSchema>;

const updateWidgetCrossField = z.any().superRefine((value, ctx) => {
  const patch = ((value ?? {}) as { patch?: Record<string, unknown> }).patch ?? {};
  if (Object.keys(patch).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: invalidParamMessage("patch", "at least one configuration field to change must be provided", '{ "label": "New label" }') });
  }
});

async function updateWidgetTool(context: ServerContext, params: UpdateWidgetSchema): Promise<string> {
  const current = { ...(await context.resources.dashboards.widgets.info(params.dashboard_id, params.widget_id)) } as unknown as Record<string, unknown>;
  const result = validateWidgetUpdate(current, params.patch);
  if (!result.ok) {
    throw new Error(formatValidationIssues(result.issues, "widget_schema_lookup"));
  }

  // Controlled local confirmation: the SDK success text is server-provided
  // and may echo submitted values, so it never reaches the result.
  await context.resources.dashboards.widgets.edit(params.dashboard_id, params.widget_id, result.wireUpdate as never);
  return `Widget \`${params.widget_id}\` updated.`;
}

const updateWidgetConfigJSON: IToolConfig = {
  name: "update_widget",
  description: `Updates an existing widget's configuration on a TagoIO dashboard. The patch is merged with the current configuration and validated against the official widget schema for the widget's type before any change is sent.

Configuration only: placement (x/y/size) is never accepted here; it lives in the dashboard arrangement and is changed via update_dashboard. The widget type is immutable: delete and recreate the widget to change its type.

<example>
{
  "dashboard_id": "61f0000000000000000da001",
  "widget_id": "61f0000000000000000db001",
  "patch": { "label": "Fill Level" }
}
</example>

Key limitations: the patch must contain at least one field; nested objects merge recursively while arrays replace atomically (send the complete new array); use widget_schema_lookup with mode "update" for the exact schema. Because the API replaces each top-level configuration object wholesale, the server sends every changed top-level object in complete merged form; the caller-facing contract stays a compact patch.`,
  parameters: updateWidgetBaseSchema.shape,
  title: "Update Widget",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: updateWidgetCrossField,
  tool: updateWidgetTool,
};

export { updateWidgetConfigJSON };
