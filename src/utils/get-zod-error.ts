import { ZodError } from "zod/v3";

/**
 * Function to get the error message from zod
 * @param error
 * @returns
 */
async function getZodError(error: ZodError) {
  if (error instanceof ZodError) {
    throw error.issues.shift()?.message;
  }
  throw error;
}

export { getZodError };
