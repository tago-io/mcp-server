import { applyCrossFieldValidation } from "../services/apply-cross-field";
import { IToolConfig, ServerContext } from "../services/types";

/**
 * Invokes a tool exactly as the composition root does: cross-field validation
 * first (throwing the actionable message on failure), then the handler. Unit
 * tests use this instead of calling `toolConfig.tool` directly so they exercise
 * the same boundary that rejects invalid input before the handler runs.
 */
async function invokeTool(toolConfig: IToolConfig, context: ServerContext, params: unknown): Promise<string> {
  applyCrossFieldValidation(toolConfig, params);
  return toolConfig.tool(context, params);
}

export { invokeTool };
