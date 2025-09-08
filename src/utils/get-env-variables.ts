import * as dotenv from "dotenv";
import { execSync } from "node:child_process";

import { environmentModel, IEnvironmentModel } from "./config.model";

// Load environment variables from .env file.
dotenv.config();

function checkTagoioCli(): boolean {
  try {
    execSync("which tagoio", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getTagoToken(): string {
  // First priority: Check if tagoio CLI is installed and try to get MCP token
  if (checkTagoioCli()) {
    try {
      execSync('tagoio mcp-config', { stdio: 'ignore' });
      // If mcp-config succeeds, try to get the MCP token (it's base64 encoded)
      if (process.env.TAGOIO_MCP_TOKEN) {
        return Buffer.from(process.env.TAGOIO_MCP_TOKEN, "base64").toString("utf-8");
      }
    } catch {
      // mcp-config failed, continue to next method
    }
  }
  // Third priority: Fallback to regular environment variable
  return process.env.TAGOIO_TOKEN || "";
}

function getTagoApi(): string {
  // First priority: Check for MCP API environment variable
  if (process.env.TAGOIO_MCP_API) {
    return process.env.TAGOIO_MCP_API;
  }
  
  // Second priority: Regular TAGOIO_API environment variable
  return process.env.TAGOIO_API as string;
}

export const ENV: IEnvironmentModel = environmentModel.parse({
  LOG_LEVEL: process.env.LOG_LEVEL,
  TAGOIO_TOKEN: getTagoToken(),
  TAGOIO_API: getTagoApi(),
});

