import { z } from "zod/v3";

const LOG_LEVEL = z.enum(["DEBUG", "INFO", "WARNING", "ERROR", "SILENT"]).optional().default("INFO");

/**
 * Environment for stdio mode: the operator supplies the credential and endpoint
 * up front, so the schema owns their rules. TAGOIO_TOKEN is required non-empty;
 * TAGOIO_API is an https URL defaulting to the US region.
 */
const stdioEnvSchema = z.object({
  LOG_LEVEL,
  TAGOIO_TOKEN: z.string().min(1, "TAGOIO_TOKEN environment variable is required"),
  TAGOIO_API: z
    .string()
    .url("TAGOIO_API must be a valid URL")
    .refine((value) => value.startsWith("https://"), "TAGOIO_API must be an https:// URL")
    .optional()
    .default("https://api.us-e1.tago.io"),
});

/**
 * Environment for the HTTP server: the token arrives per request, so the only
 * startup config is the listen port. MCP_PORT defaults to 3000 and must be a
 * valid TCP port; http-server turns a parse failure into a friendly log + exit.
 */
const serverEnvSchema = z.object({
  MCP_PORT: z.coerce.number().int().min(0).max(65535).optional().default(3000),
});

type StdioEnv = z.infer<typeof stdioEnvSchema>;
type ServerEnv = z.infer<typeof serverEnvSchema>;

export { serverEnvSchema, stdioEnvSchema };
export type { ServerEnv, StdioEnv };
