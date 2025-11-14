import { z } from "zod";

/**
 * Zod schema for environment variables.
 */
const environmentModel = z.object({
  LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARNING", "ERROR"]).optional().default("INFO"),
  TAGOIO_TOKEN: z.string(),
  TAGOIO_API: z.string().default("https://api.us-e1.tago.io"),
});

/**
 * Zod schema defining the request headers required for client connections to the MCP server.
 */
const headersModel = z.object({
  authorization: z.string({ message: "Authorization header is required" }).transform((val) => val.replace(/^Bearer\s+/i, "")),
  "tagoio-api": z.string().default("https://api.us-e1.tago.io"),
});

type IEnvironmentModel = z.infer<typeof environmentModel>;
type IHeadersModel = z.infer<typeof headersModel>;

export { environmentModel, IEnvironmentModel, headersModel, IHeadersModel }; // for testing purposes
