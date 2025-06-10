import { z } from "zod/v3";

/**
 * Zod schema for environment variables.
 */
const environmentModel = z.object({
  PORT: z.string().regex(/^\d+$/).default("3005").transform(Number),
  LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARNING", "ERROR"]).optional().default("INFO"),
});

/**
 * Zod schema defining the request headers required for client connections to the MCP server.
 */
const headersModel = z.object({
  authorization: z.string({ message: "Authorization header is required" }).transform((val) => val.replace(/^Bearer\s+/i, "")),
  "tagoio-api": z.string().default("https://api.tago.io"),
});

type IEnvironmentModel = z.infer<typeof environmentModel>;
type IHeadersModel = z.infer<typeof headersModel>;

export { environmentModel, IEnvironmentModel, headersModel, IHeadersModel }; // for testing purposes
