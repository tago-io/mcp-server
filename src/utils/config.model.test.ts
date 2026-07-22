import { describe, expect, it } from "vitest";
import { serverEnvSchema, stdioEnvSchema } from "./config.model";

describe("stdioEnvSchema", () => {
  const validEnv = {
    TAGOIO_TOKEN: "token123",
    TAGOIO_API: "https://api.us-e1.tago.io",
    LOG_LEVEL: "DEBUG",
  };

  it("validates a complete and valid set of environment variables", () => {
    expect(stdioEnvSchema.parse(validEnv)).toEqual(validEnv);
  });

  it("defaults TAGOIO_API and LOG_LEVEL when omitted", () => {
    const parsed = stdioEnvSchema.parse({ TAGOIO_TOKEN: "token123" });
    expect(parsed.TAGOIO_API).toBe("https://api.us-e1.tago.io");
    expect(parsed.LOG_LEVEL).toBe("INFO");
  });

  it("requires a non-empty TAGOIO_TOKEN", () => {
    expect(() => stdioEnvSchema.parse({})).toThrow(/TAGOIO_TOKEN/);
    expect(() => stdioEnvSchema.parse({ TAGOIO_TOKEN: "" })).toThrow(/TAGOIO_TOKEN/);
  });

  it("rejects a non-https TAGOIO_API", () => {
    expect(() => stdioEnvSchema.parse({ TAGOIO_TOKEN: "t", TAGOIO_API: "http://api.acme.tagoio.net" })).toThrow(/https/);
    expect(() => stdioEnvSchema.parse({ TAGOIO_TOKEN: "t", TAGOIO_API: "not-a-url" })).toThrow();
  });

  it("accepts SILENT as a valid LOG_LEVEL and rejects unknown levels", () => {
    expect(stdioEnvSchema.parse({ ...validEnv, LOG_LEVEL: "SILENT" }).LOG_LEVEL).toBe("SILENT");
    expect(() => stdioEnvSchema.parse({ ...validEnv, LOG_LEVEL: "VERBOSE" })).toThrow();
  });
});

describe("serverEnvSchema", () => {
  it("defaults MCP_PORT to 3000 when omitted", () => {
    expect(serverEnvSchema.parse({}).MCP_PORT).toBe(3000);
  });

  it("coerces a numeric string port", () => {
    expect(serverEnvSchema.parse({ MCP_PORT: "8080" }).MCP_PORT).toBe(8080);
  });

  it("rejects ports outside 0-65535 and non-numeric values", () => {
    expect(() => serverEnvSchema.parse({ MCP_PORT: "70000" })).toThrow();
    expect(() => serverEnvSchema.parse({ MCP_PORT: "-1" })).toThrow();
    expect(() => serverEnvSchema.parse({ MCP_PORT: "abc" })).toThrow();
  });
});
