import z from "zod";
import { describe, expect, it } from "vitest";

import { idModel } from "./global-params.model";

describe("analysisIdModel", () => {
  it("should validate valid ID", () => {
    const result = idModel.id.safeParse("679a6c82ccfd1f0009196a89");
    expect(result.success).toBe(true);
  });

  it("should reject ID shorter than 24 characters", () => {
    const result = idModel.id.safeParse("123");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("ID must be 24 characters long");
    }
  });

  it("should reject ID longer than 24 characters", () => {
    const result = idModel.id.safeParse("679a6c82ccfd1f0009196a89extra");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("ID must be 24 characters long");
    }
  });

  it("should reject empty ID", () => {
    const result = idModel.id.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("ID must be 24 characters long");
    }
  });

  it("should validate complete valid object", () => {
    const validObject = {
      id: "679a6c82ccfd1f0009196a89",
    };
    const schema = z.object(idModel);
    const result = schema.safeParse(validObject);
    expect(result.success).toBe(true);
  });
});
