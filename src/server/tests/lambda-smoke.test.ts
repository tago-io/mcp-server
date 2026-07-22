import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mockServer, strictListenOptions } from "../../testing/mocks/server";
import { SERVER_NAME, SERVER_VERSION } from "../../utils/server-config";
import { handler } from "../lambda-handler";

/**
 * Representative Lambda transport smoke: invokes the real handler (no module
 * mocks) with MSW serving all TagoIO API traffic, including the token
 * validation request.
 */
const TOKEN = "a-0000000000000000000000000000000000";

function makeEvent(body: unknown, extraHeaders: Record<string, string> = {}): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: "/",
    rawQueryString: "",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    isBase64Encoded: false,
    body: JSON.stringify(body),
    requestContext: {
      accountId: "123456789",
      apiId: "api-id",
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      domainPrefix: "test",
      http: { method: "POST", path: "/", protocol: "HTTP/1.1", sourceIp: "127.0.0.1", userAgent: "smoke" },
      requestId: "req-1",
      routeKey: "$default",
      stage: "$default",
      time: "01/Jan/2026:00:00:00 +0000",
      timeEpoch: 1767225600000,
    },
  } as APIGatewayProxyEventV2;
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterAll(() => mockServer.close());

describe("Lambda transport smoke", () => {
  it("initializes with the shared server metadata", async () => {
    const result = (await handler(
      makeEvent({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "0.0.0" } },
      })
    )) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(200);
    const json = JSON.parse(result.body ?? "{}");
    expect(json.result.serverInfo).toMatchObject({ name: SERVER_NAME, version: SERVER_VERSION });
  });

  const initializeBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "0.0.0" } },
  };

  it.each(["us-e1", "eu-w1"])("accepts the %s region header", async (code) => {
    const result = (await handler(makeEvent(initializeBody, { "x-tagoio-region": code }))) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(200);
  });

  // API Gateway can deliver headers in the client's original casing, so the
  // mixed-case header must be honored, not silently ignored in favor of the
  // default region (which is what an invalid value here would fall back to).
  it("accepts a mixed-case X-TagoIO-Region header", async () => {
    const result = (await handler(makeEvent(initializeBody, { "X-TagoIO-Region": "eu-w1" }))) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(200);
  });

  it("rejects an invalid region in a mixed-case X-TagoIO-Region header with 400", async () => {
    const result = (await handler(makeEvent(initializeBody, { "X-TagoIO-Region": "unknown-code" }))) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(400);
    const json = JSON.parse(result.body ?? "{}");
    expect(json.error.message).toContain("Invalid x-tagoio-region");
  });

  it("accepts a mixed-case Authorization header", async () => {
    const event = makeEvent(initializeBody);
    event.headers = { ...event.headers, AUTHORIZATION: `Bearer ${TOKEN}` };
    delete event.headers.authorization;

    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(200);
  });

  // MSW rejects unhandled outbound traffic, so a 400 here also proves the
  // caller's credential was never forwarded to the attacker-supplied host.
  it.each(["http://evil.example.com", "https://127.0.0.1", "localhost", "api.internal:8080", "10.0.0.1", "us-e1/extra", "https://user:pass@api.us-e1.tago.io", "unknown-code"])(
    "rejects region header %s with 400 before any outbound request",
    async (value) => {
      const result = (await handler(makeEvent(initializeBody, { "x-tagoio-region": value }))) as APIGatewayProxyStructuredResultV2;
      expect(result.statusCode).toBe(400);
      const json = JSON.parse(result.body ?? "{}");
      expect(json.error.message).toContain("Invalid x-tagoio-region");
    }
  );

  it("executes a profile metrics call end to end", async () => {
    const result = (await handler(
      makeEvent({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_profile_limits", arguments: {} },
      })
    )) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(200);
    const json = JSON.parse(result.body ?? "{}");
    expect(json.result.isError).toBeFalsy();
    expect(json.result.content[0].text).toContain("limits");
  });
});
