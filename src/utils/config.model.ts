import { z } from "zod";

/**
 * Zod schema for environment variables.
 */
const environmentModel = z.object({
  LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARNING", "ERROR"]).optional().default("INFO"),
  TAGOIO_TOKEN: z.string().optional().default(""),
  TAGOIO_API: z.string().optional().default("https://api.us-e1.tago.io"),
});

type IEnvironmentModel = z.infer<typeof environmentModel>;

export { environmentModel, IEnvironmentModel };
