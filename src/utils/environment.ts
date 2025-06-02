import { z } from "zod";

/**
 * Zod schema for environment variables.
 */
const environmentModel = z.object({
  TAGOIO_API: z.string({ required_error: "TAGOIO_API is required" }).url({ message: "TAGOIO_API must be a valid URL" }),
  PROFILE_TOKEN: z.string({ required_error: "PROFILE_TOKEN is required" }),
  PORT: z.string().regex(/^\d+$/).transform(Number).default("8000"),
  LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARNING", "ERROR"]).default("INFO"),
});

type IEnvironmentModel = z.infer<typeof environmentModel>;

export { environmentModel, IEnvironmentModel }; // for testing purposes
