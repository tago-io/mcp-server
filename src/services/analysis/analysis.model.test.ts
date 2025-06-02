import z from "zod";
import { describe, it, expect } from "vitest";

import { analysisListModel } from "./analysis.model";

describe("Analysis Models", () => {
  describe("analysisListModel", () => {
    it("should validate valid amount", () => {
      const result = analysisListModel.amount.safeParse(100);
      expect(result.success).toBe(true);
    });

    it("should reject amount greater than 200", () => {
      const result = analysisListModel.amount.safeParse(201);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Number must be less than or equal to 200");
      }
    });

    it("should validate valid fields array", () => {
      const result = analysisListModel.fields.safeParse(["name", "active", "created_at"]);
      expect(result.success).toBe(true);
    });

    it("should reject invalid fields", () => {
      const result = analysisListModel.fields.safeParse(["invalid_field"]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid enum value");
      }
    });

    it("should accept undefined fields", () => {
      const result = analysisListModel.fields.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it("should validate complete valid object", () => {
      const validObject = {
        amount: 100,
        fields: ["name", "active", "created_at"],
      };
      const schema = z.object(analysisListModel);
      const result = schema.safeParse(validObject);
      expect(result.success).toBe(true);
    });
  });
});
