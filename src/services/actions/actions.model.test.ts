import { z } from "zod/v3";
import { describe, it, expect } from "vitest";

import { actionListModel } from "./actions.model.js";

describe("Actions Model", () => {
  describe("actionListModel", () => {
    const validFields = ["id", "active", "name", "description", "created_at", "updated_at", "last_triggered", "tags", "type", "action"] as const;

    it("should accept valid fields", () => {
      const schema = z.object({ fields: actionListModel.fields });
      const result = schema.safeParse({ fields: ["name", "active"] });
      expect(result.success).toBe(true);
    });

    it("should accept all valid fields", () => {
      const schema = z.object({ fields: actionListModel.fields });
      const result = schema.safeParse({ fields: validFields });
      expect(result.success).toBe(true);
    });

    it("should reject invalid field", () => {
      const schema = z.object({ fields: actionListModel.fields });
      const result = schema.safeParse({ fields: ["invalid_field"] });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid enum value");
      }
    });

    it("should accept empty array", () => {
      const schema = z.object({ fields: actionListModel.fields });
      const result = schema.safeParse({ fields: [] });
      expect(result.success).toBe(true);
    });

    it("should accept undefined fields", () => {
      const schema = z.object({ fields: actionListModel.fields });
      const result = schema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
