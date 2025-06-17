import { describe, expect, it } from "vitest";

import { genericIDSchema, querySchema } from "./global-params.model";

describe("analysisgenericIDSchema", () => {
  it("should validate valid ID", () => {
    const result = genericIDSchema.safeParse({ id: "679a6c82ccfd1f0009196a89" });
    expect(result.success).toBe(true);
  });

  it("should reject ID shorter than 24 characters", () => {
    const result = genericIDSchema.safeParse({ id: "123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("ID must be 24 characters long");
    }
  });

  it("should reject ID longer than 24 characters", () => {
    const result = genericIDSchema.safeParse({ id: "679a6c82ccfd1f0009196a89extra" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("ID must be 24 characters long");
    }
  });

  it("should reject empty ID", () => {
    const result = genericIDSchema.safeParse({ id: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("ID must be 24 characters long");
    }
  });

  it("should validate complete valid object", () => {
    const validObject = {
      id: "679a6c82ccfd1f0009196a89",
    };
    const result = genericIDSchema.safeParse(validObject);
    expect(result.success).toBe(true);
  });
});

describe("querySchema", () => {
  describe("page field", () => {
    it("should validate valid page number", () => {
      const result = querySchema.safeParse({ page: 1 });
      expect(result.success).toBe(true);
    });

    it("should reject page number less than 1", () => {
      const result = querySchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Number must be greater than or equal to 1");
      }
    });

    it("should accept undefined page", () => {
      const result = querySchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("amount field", () => {
    it("should validate valid amount", () => {
      const result = querySchema.safeParse({ amount: 100 });
      expect(result.success).toBe(true);
    });

    it("should reject amount less than 1", () => {
      const result = querySchema.safeParse({ amount: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Number must be greater than or equal to 1");
      }
    });

    it("should reject amount greater than 10000", () => {
      const result = querySchema.safeParse({ amount: 10001 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Number must be less than or equal to 10000");
      }
    });
  });

  describe("fields field", () => {
    it("should validate valid fields array", () => {
      const result = querySchema.safeParse({ fields: ["name", "email"] });
      expect(result.success).toBe(true);
    });

    it("should reject non-string array elements", () => {
      const result = querySchema.safeParse({ fields: ["name", 123] });
      expect(result.success).toBe(false);
    });
  });

  describe("filter field", () => {
    it("should validate valid filter object", () => {
      const result = querySchema.safeParse({ filter: { name: "test", age: 25 } });
      expect(result.success).toBe(true);
    });

    it("should accept empty filter object", () => {
      const result = querySchema.safeParse({ filter: {} });
      expect(result.success).toBe(true);
    });
  });
});
