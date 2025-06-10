import Fastify, { FastifyRequest } from "fastify";
import * as dotenv from "dotenv";
import { Resources } from "@tago-io/sdk";
import { Sessions, streamableHttp } from "fastify-mcp/dist/index";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import awsLambdaFastify from "@fastify/aws-lambda";

import { handlerTools } from "./mcp-tools";
import { environmentModel, IEnvironmentModel } from "./utils/config.model";
import { JSONRPCRequest } from "./interfaces";
import { authenticate } from "./authentication";

// Load environment variables from .env file in development, Lambda will have environment variables set by CDK
dotenv.config();

const ENV: IEnvironmentModel = environmentModel.parse({
  PORT: process.env.PORT,
  LOG_LEVEL: process.env.LOG_LEVEL,
});

// Lazy resource that will be initialized with the correct tokens
let RESOURCES: Resources;

// Initialize Fastify server with appropriate logger configuration
const fastify = Fastify({
  logger: {
    level: ENV.LOG_LEVEL,
    transport: process.env.AWS_EXECUTION_ENV
      ? undefined
      : {
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

  const resources = await authenticate({
    profileToken: request?.headers?.authorization,
    tagoioApi: request?.headers?.["tagoio-api"],
  });
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

fastify.setErrorHandler((error, _request, reply) => {
  reply.status(error.statusCode || 500).send({
    jsonrpc: "2.0",
    error: { code: -32000, message: error?.message || error },
    id: null,
  });
});

/**
 * Start function for local development
 */
export const start = async () => {
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // If running locally, start the server
    const port = ENV.PORT;
    try {
      await fastify.listen({ port, host: "0.0.0.0" });
      console.log(`Server listening on http://0.0.0.0:${port}/mcp`);
    } catch (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
  }

  return fastify;
};

/**
 * AWS Lambda handler using @fastify/aws-lambda
 */
export const handler = awsLambdaFastify(fastify, {
  // Enable binary media types support
  binaryMimeTypes: ["*/*"],
  // Enable request context
  decorateRequest: true,
  // Enable source IP forwarding
  enforceBase64: (request) => {
    // Only enforce base64 for binary content types
    const contentType = request.headers["content-type"] || "";
    return contentType.includes("application/octet-stream") || contentType.includes("image/") || contentType.includes("video/") || contentType.includes("audio/");
  },
});

// If this file is being executed directly (not imported)
if (require.main === module) {
  start().catch(console.error);
}
