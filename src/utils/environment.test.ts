import { describe, it, expect } from "vitest";
import { environmentModel } from "./environment";

// Helper para criar um objeto base válido
const defaultEnv = {
  TAGOIO_API: "https://api.tago.io",
  PROFILE_TOKEN: "token123",
  PORT: "8080",
  LOG_LEVEL: "DEBUG",
};

// process.env = defaultEnv; // Set the environment variables for the test

describe("environmentModel", () => {
  it("valida um conjunto completo e válido de variáveis", () => {
    const parsed = environmentModel.parse(defaultEnv);
    expect(parsed).toEqual({
      TAGOIO_API: "https://api.tago.io",
      PROFILE_TOKEN: "token123",
      PORT: 8080,
      LOG_LEVEL: "DEBUG",
    });
  });

  it("usa valores padrão para PORT e LOG_LEVEL", () => {
    const { PORT, LOG_LEVEL, ...env } = defaultEnv;
    const parsed = environmentModel.parse(env);
    expect(parsed.PORT).toBe(8000);
    expect(parsed.LOG_LEVEL).toBe("INFO");
  });

  it("lança erro se TAGOIO_API estiver ausente", () => {
    const { TAGOIO_API, ...env } = defaultEnv;
    expect(() => environmentModel.parse(env)).toThrow("TAGOIO_API is required");
  });

  it("lança erro se TAGOIO_API for inválido", () => {
    const env = { ...defaultEnv, TAGOIO_API: "not-a-url" };
    expect(() => environmentModel.parse(env)).toThrow("TAGOIO_API must be a valid URL");
  });

  it("lança erro se PROFILE_TOKEN estiver ausente", () => {
    const { PROFILE_TOKEN, ...env } = defaultEnv;
    expect(() => environmentModel.parse(env)).toThrow("PROFILE_TOKEN is required");
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
