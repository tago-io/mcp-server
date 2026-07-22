import { z } from "zod/v3";

import { invalidParamMessage } from "./tool-errors";

/**
 * Builds a cross-field refinement that fails when none of `keys` is present on
 * the parsed params. Used for the "at least one editable field must be provided
 * alongside the ID" contract shared by the update tools; the message matches the
 * actionable utils/tool-errors.ts format.
 */
function requireAtLeastOne(keys: readonly string[], param: string, constraint: string, example: string): z.ZodTypeAny {
  return z.any().superRefine((value, ctx) => {
    const obj = (value ?? {}) as Record<string, unknown>;
    if (!keys.some((key) => obj[key] !== undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: invalidParamMessage(param, constraint, example) });
    }
  });
}

export { requireAtLeastOne };
