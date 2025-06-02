import { describe, it, expect } from "vitest";
import { actionListModel } from "./actions.model";
import z from "zod";

describe("Actions Model", () => {
  describe("actionListModel", () => {
    describe("amount field", () => {
      it("should accept valid amount", () => {
        const schema = z.object({ amount: actionListModel.amount });
        const result = schema.safeParse({ amount: 100 });
        expect(result.success).toBe(true);
      });

      it("should reject amount greater than 200", () => {
        const schema = z.object({ amount: actionListModel.amount });
        const result = schema.safeParse({ amount: 201 });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe("Number must be less than or equal to 200");
        }
      });

      it("should accept undefined amount", () => {
        const schema = z.object({ amount: actionListModel.amount });
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
      });
    });

    describe("fields field", () => {
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

    describe("complete model", () => {
      it("should validate complete valid object", () => {
        const schema = z.object(actionListModel);
        const result = schema.safeParse({
          amount: 100,
          fields: ["name", "active", "type"],
        });
        expect(result.success).toBe(true);
      });

      it("should validate empty object", () => {
        const schema = z.object(actionListModel);
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
      });

      it("should validate object with only amount", () => {
        const schema = z.object(actionListModel);
        const result = schema.safeParse({ amount: 100 });
        expect(result.success).toBe(true);
      });

      it("should validate object with only fields", () => {
        const schema = z.object(actionListModel);
        const result = schema.safeParse({ fields: ["name", "active"] });
        expect(result.success).toBe(true);
      });
    });
  });
});
