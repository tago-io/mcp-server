import { describe, it, expect } from "vitest";

import { analysisListSchema } from "../tools/analysis-lookup";

describe("Analysis Models", () => {
  describe("analysisListSchema", () => {
    it("should validate valid fields array", () => {
      const result = analysisListSchema.shape.fields.safeParse(["name", "active", "created_at"]);
      expect(result.success).toBe(true);
    });

    it("should reject invalid fields", () => {
      const result = analysisListSchema.shape.fields.safeParse(["invalid_field"]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid enum value");
      }
    });

    it("should accept undefined fields", () => {
      const result = analysisListSchema.shape.fields.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it("should validate complete valid object", () => {
      const validObject = {
        amount: 100,
        fields: ["name", "active", "created_at"],
      };
      const result = analysisListSchema.safeParse(validObject);
      expect(result.success).toBe(true);
    });

    it("should transform name filter with wildcard matching", () => {
      const validInput = {
        filter: {
          name: "analysis",
        },
      };
      const result = analysisListSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      expect(result.data?.filter?.name).toBe("*analysis*");
    });
  });
});
