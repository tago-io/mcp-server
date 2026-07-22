import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Resources } from "@tago-io/sdk";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./shared", () => ({
  CORS_HEADERS: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
  },
  DEFAULT_TAGOIO_REGION: "us-e1",
  VALID_REGIONS: ["us-e1", "eu-w1"],
  extractToken: vi.fn(),
  validateTagoToken: vi.fn(),
  isTokenError: vi.fn(),
}));

vi.mock("./build-server", () => ({
  buildServer: vi.fn(),
}));

const { mockHandleRequest, mockClose } = vi.hoisted(() => ({
  mockHandleRequest: vi.fn(),
  mockClose: vi.fn(),
}));
vi.mock("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", () => ({
  WebStandardStreamableHTTPServerTransport: vi.fn().mockImplementation(function () {
    return { handleRequest: mockHandleRequest, close: mockClose };
  }),
}));

import { handler as rawHandler } from "./lambda-handler";
import { buildServer } from "./build-server";
import { extractToken, isTokenError, validateTagoToken } from "./shared";

async function invoke(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return (await rawHandler(event)) as APIGatewayProxyStructuredResultV2;
}

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> & { method?: string; path?: string } = {}): APIGatewayProxyEventV2 {
  const { method = "POST", path = "/", ...rest } = overrides;
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: path,
    rawQueryString: "",
    headers: rest.headers ?? { authorization: "Bearer test-token" },
    isBase64Encoded: rest.isBase64Encoded ?? false,
    body: rest.body ?? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    requestContext: {
      accountId: "123456789",
      apiId: "api-id",
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      domainPrefix: "test",
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-123",
      routeKey: "$default",
      stage: "$default",
      time: "01/Jan/2025:00:00:00 +0000",
      timeEpoch: 1735689600000,
    },
    ...rest,
  } as APIGatewayProxyEventV2;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Lambda handler", () => {
  describe("OPTIONS (CORS preflight)", () => {
    it("returns 204 with CORS headers", async () => {
      const event = makeEvent({ method: "OPTIONS" });
      const result = await invoke(event);

      expect(result.statusCode).toBe(204);
      expect(result.headers?.["Access-Control-Allow-Origin"]).toBe("*");
      expect(result.headers?.["Access-Control-Max-Age"]).toBe("86400");
    });
  });

  describe("path validation", () => {
    it("returns 404 for non-root paths", async () => {
      const event = makeEvent({ path: "/other" });
      const result = await invoke(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body as string);
      expect(body.error).toBe("Not Found");
    });
  });

  describe("method validation", () => {
    it("returns 405 for GET requests", async () => {
      const event = makeEvent({ method: "GET" });
      const result = await invoke(event);

      expect(result.statusCode).toBe(405);
      const body = JSON.parse(result.body as string);
      expect(body.error).toBe("Method Not Allowed");
    });

    it("returns 405 for DELETE requests", async () => {
      const event = makeEvent({ method: "DELETE" });
      const result = await invoke(event);

      expect(result.statusCode).toBe(405);
    });
  });

  describe("authentication", () => {
    it("returns 401 when token is missing", async () => {
      vi.mocked(extractToken).mockReturnValue(null);

      const event = makeEvent({ headers: {} });
      const result = await invoke(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body as string);
      expect(body.error.message).toContain("Token required");
    });

    it("returns 401 when token validation fails", async () => {
      vi.mocked(extractToken).mockReturnValue("bad-token");
      vi.mocked(isTokenError).mockReturnValue(true);
      vi.mocked(validateTagoToken).mockResolvedValue({
        error: "Unauthorized: Invalid TagoIO token",
        statusCode: 401,
      });

      const event = makeEvent();
      const result = await invoke(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body as string);
      expect(body.error.message).toContain("Invalid TagoIO token");
    });

    it("returns 502 when TagoIO API is unreachable", async () => {
      vi.mocked(extractToken).mockReturnValue("valid-token");
      vi.mocked(isTokenError).mockReturnValue(true);
      vi.mocked(validateTagoToken).mockResolvedValue({
        error: 'Unable to reach TagoIO API for region "us-e1". Check network connectivity.',
        statusCode: 502,
      });

      const event = makeEvent();
      const result = await invoke(event);

      expect(result.statusCode).toBe(502);
    });
  });

  describe("successful MCP request", () => {
    it("processes a valid MCP request and returns the response", async () => {
      vi.mocked(extractToken).mockReturnValue("valid-token");
      vi.mocked(isTokenError).mockReturnValue(false);

      const fakeResources = {} as Resources;
      vi.mocked(validateTagoToken).mockResolvedValue({
        resources: fakeResources,
        region: { api: "https://api.us-e1.tago.io", sse: "https://sse.us-e1.tago.io" },
        credential: { credentialKind: "analysis" },
      });

      const mockMcpServer = { connect: vi.fn(), close: vi.fn() };
      vi.mocked(buildServer).mockReturnValue(mockMcpServer as unknown as McpServer);

      const responseHeaders = new Headers({ "content-type": "application/json" });
      mockHandleRequest.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{"jsonrpc":"2.0","id":1,"result":{}}'),
        headers: responseHeaders,
      });
      mockClose.mockResolvedValue(undefined);

      const event = makeEvent();
      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      expect(mockMcpServer.connect).toHaveBeenCalled();
      expect(mockMcpServer.close).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
    });

    it("handles base64-encoded bodies", async () => {
      vi.mocked(extractToken).mockReturnValue("valid-token");
      vi.mocked(isTokenError).mockReturnValue(false);

      const fakeResources = {} as Resources;
      vi.mocked(validateTagoToken).mockResolvedValue({
        resources: fakeResources,
        region: { api: "https://api.us-e1.tago.io", sse: "https://sse.us-e1.tago.io" },
        credential: { credentialKind: "analysis" },
      });

      const mockMcpServer = { connect: vi.fn(), close: vi.fn() };
      vi.mocked(buildServer).mockReturnValue(mockMcpServer as unknown as McpServer);

      const responseHeaders = new Headers({ "content-type": "application/json" });
      mockHandleRequest.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{"jsonrpc":"2.0","id":1,"result":{}}'),
        headers: responseHeaders,
      });
      mockClose.mockResolvedValue(undefined);

      const jsonBody = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
      const base64Body = Buffer.from(jsonBody).toString("base64");

      const event = makeEvent({ body: base64Body, isBase64Encoded: true });
      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    it("returns 500 when MCP transport throws", async () => {
      vi.mocked(extractToken).mockReturnValue("valid-token");
      vi.mocked(isTokenError).mockReturnValue(false);

      const fakeResources = {} as Resources;
      vi.mocked(validateTagoToken).mockResolvedValue({
        resources: fakeResources,
        region: { api: "https://api.us-e1.tago.io", sse: "https://sse.us-e1.tago.io" },
        credential: { credentialKind: "analysis" },
      });

      const mockMcpServer = { connect: vi.fn(), close: vi.fn() };
      vi.mocked(buildServer).mockReturnValue(mockMcpServer as unknown as McpServer);

      mockHandleRequest.mockRejectedValue(new Error("Transport error"));
      mockClose.mockResolvedValue(undefined);

      const event = makeEvent();
      const result = await invoke(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body as string);
      expect(body.error.code).toBe(-32603);
      expect(body.error.message).toContain("Internal server error");

      // Verify cleanup still happens
      expect(mockMcpServer.close).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
    });

    it("cleans up MCP server even when response.text() throws", async () => {
      vi.mocked(extractToken).mockReturnValue("valid-token");
      vi.mocked(isTokenError).mockReturnValue(false);

      const fakeResources = {} as Resources;
      vi.mocked(validateTagoToken).mockResolvedValue({
        resources: fakeResources,
        region: { api: "https://api.us-e1.tago.io", sse: "https://sse.us-e1.tago.io" },
        credential: { credentialKind: "analysis" },
      });

      const mockMcpServer = { connect: vi.fn(), close: vi.fn() };
      vi.mocked(buildServer).mockReturnValue(mockMcpServer as unknown as McpServer);

      const responseHeaders = new Headers();
      mockHandleRequest.mockResolvedValue({
        status: 200,
        text: () => Promise.reject(new Error("Body read error")),
        headers: responseHeaders,
      });
      mockClose.mockResolvedValue(undefined);

      const event = makeEvent();
      const result = await invoke(event);

      expect(result.statusCode).toBe(500);
      expect(mockMcpServer.close).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
