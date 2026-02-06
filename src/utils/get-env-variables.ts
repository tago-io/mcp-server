import * as dotenv from "dotenv";

import { environmentModel, IEnvironmentModel } from "./config.model";

// Load environment variables from .env file.
dotenv.config();

export function getEnvVariables(): IEnvironmentModel {
  return environmentModel.parse({
    LOG_LEVEL: process.env.LOG_LEVEL,
    TAGOIO_TOKEN: process.env.TAGOIO_TOKEN,
    TAGOIO_API: process.env.TAGOIO_API,
  });
}