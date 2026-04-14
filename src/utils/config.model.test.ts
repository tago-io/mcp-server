import { describe, expect, it } from "vitest";
import { environmentModel } from "./config.model";

// Helper to create a valid base object for environment
const defaultEnv = {
  TAGOIO_TOKEN: "token123",
  TAGOIO_API: "https://api.us-e1.tago.io",
  LOG_LEVEL: "DEBUG",
};

describe("environmentModel", () => {
  it("validates a complete and valid set of environment variables", () => {
    const parsed = environmentModel.parse(defaultEnv);
    expect(parsed).toEqual({
      TAGOIO_TOKEN: "token123",
      TAGOIO_API: "https://api.us-e1.tago.io",
      LOG_LEVEL: "DEBUG",
    });
  });

  it("uses default values for TAGOIO_API and LOG_LEVEL", () => {
    const parsed = environmentModel.parse({ TAGOIO_TOKEN: "token123" });
    expect(parsed.TAGOIO_API).toBe("https://api.us-e1.tago.io");
    expect(parsed.LOG_LEVEL).toBe("INFO");
  });

  it("defaults TAGOIO_TOKEN to empty string if missing", () => {
    const { TAGOIO_TOKEN, ...env } = defaultEnv;
    const parsed = environmentModel.parse(env);
    expect(parsed.TAGOIO_TOKEN).toBe("");
  });

  it("accepts SILENT as a valid LOG_LEVEL", () => {
    const env = { ...defaultEnv, LOG_LEVEL: "SILENT" };
    const parsed = environmentModel.parse(env);
    expect(parsed.LOG_LEVEL).toBe("SILENT");
  });

  it("throws error if LOG_LEVEL is invalid", () => {
    const env = { ...defaultEnv, LOG_LEVEL: "VERBOSE" };
    expect(() => environmentModel.parse(env)).toThrow();
  });
});
