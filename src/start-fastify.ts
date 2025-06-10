import Fastify, { FastifyRequest } from "fastify";
import * as dotenv from "dotenv";
import { Resources } from "@tago-io/sdk";
import { Sessions, streamableHttp } from "fastify-mcp/dist/index";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { handlerTools } from "./mcp-tools";
import { environmentModel, IEnvironmentModel } from "./utils/config.model";
import { JSONRPCRequest } from "./interfaces";
import { authenticate } from "./authentication";

// Load environment variables from .env file.
dotenv.config();

const ENV: IEnvironmentModel = environmentModel.parse({ PORT: process.env.PORT, LOG_LEVEL: process.env.LOG_LEVEL });

// Lazy resource that will be initialized with the correct tokens
let RESOURCES: Resources;

// Initialize Fastify server with pino-pretty logger for better logging experience.
const fastify = Fastify({
  logger: {
    level: ENV.LOG_LEVEL,
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

// Validate the client connection and ensure the header fields for the `Profile Token` and `TagoIO API URL` are valid.
fastify.addHook("preHandler", async (request: FastifyRequest<{ Body: JSONRPCRequest }>) => {
  const isInitialize = request.body?.method === "initialize";
  if (!isInitialize) {
    return;
  }

  const resources = await authenticate({ profileToken: request?.headers?.authorization, tagoioApi: request?.headers?.["tagoio-api"] });
  RESOURCES = resources;
});

// Register the MCP server using Fastify.
fastify.register(streamableHttp as any, {
  stateful: true,
  mcpEndpoint: "/mcp",
  createServer: async () => {
    fastify.log.debug("Creating new MCP server instance");
    const mcpServer = new McpServer({
      name: "middleware-mcp-tagoio",
      version: "1.0.0",
    });

    await handlerTools(mcpServer, RESOURCES);
    fastify.log.debug("MCP server instance created and tools registered");

    return mcpServer.server;
  },
  sessions: new Sessions<StreamableHTTPServerTransport>(),
});

// TODO: Add a better error handler - not working as expected.
fastify.setErrorHandler((error, _request, reply) => {
  reply.status(error.statusCode || 500).send({
    jsonrpc: "2.0",
    error: { code: -32000, message: error?.message || error },
    id: null,
  });
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
