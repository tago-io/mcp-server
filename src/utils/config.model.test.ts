import { describe, it, expect } from "vitest";
import { environmentModel, headersModel } from "./config.model";

// Helper to create a valid base object for environment
const defaultEnv = {
  TAGOIO_TOKEN: "token123",
  TAGOIO_API: "https://api.tago.io",
  LOG_LEVEL: "DEBUG",
};

// Helper to create a valid base object for headers
const defaultHeaders = {
  authorization: "Bearer token123",
  "tagoio-api": "https://api.tago.io",
};

describe("environmentModel", () => {
  it("validates a complete and valid set of environment variables", () => {
    const parsed = environmentModel.parse(defaultEnv);
    expect(parsed).toEqual({
      TAGOIO_TOKEN: "token123",
      TAGOIO_API: "https://api.tago.io",
      LOG_LEVEL: "DEBUG",
    });
  });

  it("uses default values for TAGOIO_API and LOG_LEVEL", () => {
    const parsed = environmentModel.parse({ TAGOIO_TOKEN: "token123" });
    expect(parsed.TAGOIO_API).toBe("https://api.tago.io");
    expect(parsed.LOG_LEVEL).toBe("INFO");
  });

  it("throws error if TAGOIO_TOKEN is missing", () => {
    const { TAGOIO_TOKEN, ...env } = defaultEnv;
    expect(() => environmentModel.parse(env)).toThrow();
  });

  it("throws error if LOG_LEVEL is invalid", () => {
    const env = { ...defaultEnv, LOG_LEVEL: "SILENT" };
    expect(() => environmentModel.parse(env)).toThrow();
  });
});

describe("headersModel", () => {
  it("validates a complete and valid set of headers", () => {
    const parsed = headersModel.parse(defaultHeaders);
    expect(parsed).toEqual({
      authorization: "token123", // Bearer prefix should be removed
      "tagoio-api": "https://api.tago.io",
    });
  });

  it("uses default value for tagoio-api", () => {
    const { "tagoio-api": tagoApi, ...headers } = defaultHeaders;
    const parsed = headersModel.parse(headers);
    expect(parsed["tagoio-api"]).toBe("https://api.tago.io");
  });

  it("throws error if authorization is missing", () => {
    const { authorization, ...headers } = defaultHeaders;
    expect(() => headersModel.parse(headers)).toThrow("Authorization header is required");
  });

  it("removes 'Bearer' prefix from authorization token", () => {
    const headers = { ...defaultHeaders, authorization: "Bearer mytoken" };
    const parsed = headersModel.parse(headers);
    expect(parsed.authorization).toBe("mytoken");
  });

  it("keeps token as is if it doesn't have 'Bearer' prefix", () => {
    const headers = { ...defaultHeaders, authorization: "mytoken" };
    const parsed = headersModel.parse(headers);
    expect(parsed.authorization).toBe("mytoken");
  });
});
