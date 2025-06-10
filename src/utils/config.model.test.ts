import { describe, it, expect } from "vitest";
import { environmentModel, headersModel } from "./config.model";

// Helper to create a valid base object for environment
const defaultEnv = {
  PORT: "8080",
  LOG_LEVEL: "DEBUG",
};

// Helper to create a valid base object for headers
const defaultHeaders = {
  authorization: "Bearer token123",
  "tagoio-api": "https://api.tago.io",
};

describe("environmentModel", () => {
  it("valida um conjunto completo e válido de variáveis", () => {
    const parsed = environmentModel.parse(defaultEnv);
    expect(parsed).toEqual({
      PORT: 8080,
      LOG_LEVEL: "DEBUG",
    });
  });

  it("usa valores padrão para PORT e LOG_LEVEL", () => {
    const parsed = environmentModel.parse({});
    expect(parsed.PORT).toBe(8000);
    expect(parsed.LOG_LEVEL).toBe("WARNING");
  });

  it("lança erro se PORT não for um número", () => {
    const env = { ...defaultEnv, PORT: "abc" };
    expect(() => environmentModel.parse(env)).toThrow();
  });

  it("lança erro se LOG_LEVEL for inválido", () => {
    const env = { ...defaultEnv, LOG_LEVEL: "SILENT" };
    expect(() => environmentModel.parse(env)).toThrow();
  });
});

describe("headersModel", () => {
  it("valida um conjunto completo e válido de headers", () => {
    const parsed = headersModel.parse(defaultHeaders);
    expect(parsed).toEqual({
      authorization: "token123", // Bearer prefix should be removed
      "tagoio-api": "https://api.tago.io",
    });
  });

  it("usa valor padrão para tagoio-api", () => {
    const { "tagoio-api": tagoApi, ...headers } = defaultHeaders;
    const parsed = headersModel.parse(headers);
    expect(parsed["tagoio-api"]).toBe("https://api.tago.io");
  });

  it("lança erro se authorization estiver ausente", () => {
    const { authorization, ...headers } = defaultHeaders;
    expect(() => headersModel.parse(headers)).toThrow("Authorization header is required");
  });

  it("remove o prefixo 'Bearer' do token de autorização", () => {
    const headers = { ...defaultHeaders, authorization: "Bearer mytoken" };
    const parsed = headersModel.parse(headers);
    expect(parsed.authorization).toBe("mytoken");
  });

  it("mantém o token como está se não tiver o prefixo 'Bearer'", () => {
    const headers = { ...defaultHeaders, authorization: "mytoken" };
    const parsed = headersModel.parse(headers);
    expect(parsed.authorization).toBe("mytoken");
  });
});
