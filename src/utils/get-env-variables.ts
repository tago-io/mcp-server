import * as dotenv from "dotenv";

import { StdioEnv, stdioEnvSchema } from "./config.model";

// Load environment variables from .env file.
// quiet: dotenv@17 logs to stdout by default, which corrupts the stdio JSON-RPC stream.
dotenv.config({ quiet: true });

export function getEnvVariables(): StdioEnv {
  return stdioEnvSchema.parse({
    LOG_LEVEL: process.env.LOG_LEVEL,
    TAGOIO_TOKEN: process.env.TAGOIO_TOKEN,
    TAGOIO_API: process.env.TAGOIO_API,
  });
}
