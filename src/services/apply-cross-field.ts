import { IToolConfig } from "./types";

/**
 * Applies a tool's optional cross-field validation to already-parsed params.
 * Runs at the composition root (and in tests) after the SDK parses the tool's
 * `parameters` shape, before the handler executes. On failure it throws an
 * Error carrying the refinement's actionable message, so it flows through the
 * same isError + credential-redaction path as a handler throw. Validation only
 * the handler still receives the SDK-parsed params unchanged.
 */
function applyCrossFieldValidation(toolConfig: IToolConfig, params: unknown): void {
  if (!toolConfig.crossFieldSchema) {
    return;
  }
  const parsed = toolConfig.crossFieldSchema.safeParse(params);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }
}

export { applyCrossFieldValidation };
