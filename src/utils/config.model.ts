import { z } from "zod";

/**
 * Zod schema for environment variables.
 */
const environmentModel = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number).default("8000"),
  LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARNING", "ERROR"]).default("WARNING"),
});

/**
 * Zod schema defining the request headers required for client connections to the MCP server.
 */
const headersModel = z.object({
  authorization: z.string({ required_error: "Authorization header is required" }).transform((val) => val.replace(/^Bearer\s+/i, "")),
  "tagoio-api": z.string().default("https://api.tago.io"),
});

type IEnvironmentModel = z.infer<typeof environmentModel>;
type IHeadersModel = z.infer<typeof headersModel>;

export { environmentModel, IEnvironmentModel, headersModel, IHeadersModel }; // for testing purposes
