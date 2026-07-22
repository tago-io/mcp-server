import { z } from "zod/v3";

import { invalidParamError } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { formatValidationIssues, validateWidgetCandidate, WIDGET_TYPES } from "../validation-adapter";

const validateWidgetConfigurationBaseSchema = z.object({
  configuration: z
    .record(z.string(), z.unknown())
    .describe('Complete candidate widget configuration object. Must include "type"; the schema to validate against is inferred from it (see widget_schema_lookup).'),
  mode: z.enum(["create", "update"]).describe('Which schema to validate against: "create" (default) or "update".').optional(),
});

type ValidateWidgetConfigurationSchema = z.infer<typeof validateWidgetConfigurationBaseSchema>;

async function validateWidgetConfigurationTool(_context: ServerContext, params: ValidateWidgetConfigurationSchema): Promise<string> {
  const mode = params.mode ?? "create";
  const type = params.configuration.type;
  if (typeof type !== "string" || type.length === 0) {
    throw invalidParamError(
      "configuration.type",
      `missing; the candidate must declare its widget type so the right schema can be applied (one of the ${WIDGET_TYPES.length} supported types, e.g. ${WIDGET_TYPES.slice(0, 3).join(", ")}; call widget_schema_lookup with no arguments to list them all)`,
      '"gauge"'
    );
  }

  const result = validateWidgetCandidate(params.configuration, mode);
  if (!result.ok) {
    throw new Error(formatValidationIssues(result.issues, "widget_schema_lookup"));
  }

  return `The candidate "${type}" widget configuration is valid against the ${mode} schema. Validation ran locally; no request was sent to TagoIO.`;
}

const validateWidgetConfigurationConfigJSON: IToolConfig = {
  name: "validate_widget_configuration",
  description: `Validates a candidate widget configuration against the official schema for its "type", entirely locally; no TagoIO request is made and nothing is created or changed.

Use this as a development-loop check while drafting a widget configuration, before calling create_widget or update_widget. It is not a substitute for those tools' own validation, which still runs on every mutation. On failure it lists the exact invalid paths; use widget_schema_lookup to repair them.

<example>
{ "configuration": { "label": "Tank Level", "type": "gauge", "display": { "gauge_type": "solid", "numberformat": "0", "minimum": 0, "maximum": 100 } } }
</example>`,
  parameters: validateWidgetConfigurationBaseSchema.shape,
  title: "Validate Widget Configuration",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: validateWidgetConfigurationTool,
};

export { validateWidgetConfigurationConfigJSON };
