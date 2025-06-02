import * as dotenv from "dotenv";
import Fastify from "fastify";
import { Sessions, streamableHttp } from "fastify-mcp/dist/index";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { handlerTools } from "./mcp-tools";
import { Resources } from "@tago-io/sdk";
import { environmentModel, IEnvironmentModel } from "./utils/environment";

// Load environment variables from .env file.
dotenv.config();

const ENV: IEnvironmentModel = environmentModel.parse(process.env);

process.env.TAGOIO_API = ENV.TAGOIO_API;

const RESOURCES = new Resources({ token: ENV.PROFILE_TOKEN });

// Initialize Fastify server with pino-pretty logger for better logging experience.
const fastify = Fastify({
  logger: {
    level: ENV.LOG_LEVEL || "INFO",
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
        singleLine: false,
      },
    },
  },
});

// Register the MCP server using Fastify.
fastify.register(streamableHttp as any, {
  stateful: true,
  mcpEndpoint: "/mcp",
  createServer: () => {
    fastify.log.debug("Creating new MCP server instance");
    const mcpServer = new McpServer({
      name: "middleware-mcp-tagoio",
      version: "1.0.0",
    });

    handlerTools(mcpServer, RESOURCES);
    fastify.log.debug("MCP server instance created and tools registered");

    return mcpServer.server;
  },
  sessions: new Sessions<StreamableHTTPServerTransport>(),
});

/**
 * @description Start the MCP server using Fastify.
 */
async function startServer() {
  await fastify
    .listen({ port: ENV.PORT, host: "0.0.0.0" })
    .then(() => {
      fastify.log.info(`MCP endpoint available at http://0.0.0.0:${ENV.PORT}/mcp`);
    })
    .catch((error) => {
      fastify.log.error(error);
      process.exit(1);
    });
}

startServer();
