import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getEnvVariables } from "../utils/get-env-variables.js";

import { logger } from "../utils/logger";
import { describeErrorSafely } from "../utils/safe-error";
import { buildServer } from "./build-server";
import { buildServerContext } from "./shared";

/**
 * @description Start the MCP server using stdio transport.
 */
async function startStdioServer() {
  // Kept outside the try so the failure log below can redact the configured
  // token even when startup fails after it was read.
  let configuredToken: string | undefined;
  try {
    // The stdio env schema enforces a non-empty TAGOIO_TOKEN and an https
    // TAGOIO_API; a parse failure is caught below and logged with redaction.
    const ENV = getEnvVariables();

    logger.setLogLevel(ENV.LOG_LEVEL);

    configuredToken = ENV.TAGOIO_TOKEN;

    // Single credential/region boundary for all transports. TAGOIO_API is
    // trusted operator config (may point at a dedicated instance). The result
    // error is already credential-safe; the startup catch below redacts again.
    const result = await buildServerContext({ token: ENV.TAGOIO_TOKEN, apiUrl: ENV.TAGOIO_API });
    if (!result.ok) {
      throw new Error(`Failed to connect to TagoIO API: ${result.error}. Please check your TAGOIO_TOKEN and TAGOIO_API configuration.`);
    }

    const mcpServer = buildServer(result.context);

    const transport = new StdioServerTransport();

    await mcpServer.connect(transport);

    logger.debug("MCP server started successfully with stdio transport");
    logger.debug("Tools registered and ready to receive requests");
  } catch (error) {
    logger.error("Failed to start MCP server:", describeErrorSafely(error, [configuredToken]));
    process.exit(1);
  }
}

export { startStdioServer };
