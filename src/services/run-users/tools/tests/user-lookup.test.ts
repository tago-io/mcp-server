import { describe, it, expect } from "vitest";
import { ZodError } from "zod/v3";
import { userBaseSchema } from "../user-lookup";

describe("userBaseSchema validation", () => {
  describe("valid inputs", () => {
    it("should parse minimal valid input", () => {
      const input = { operation: "lookup" as const };
      const result = userBaseSchema.parse(input);

      expect(result.operation).toBe("lookup");
      expect(result.runUserID).toBeUndefined();
      expect(result.lookupUser).toBeUndefined();
    });

    it("should parse complete lookup configuration", () => {
      const input = {
        operation: "lookup" as const,
        runUserID: "123456789012345678901234",
        lookupUser: {
          amount: 50,
          page: 2,
          fields: ["id", "name", "email", "active"] as const,
          filter: {
            id: "123456789012345678901234",
            name: "john",
            email: "test@example.com",
            active: true,
            tags: [{ key: "role", value: "admin" }],
          },
        },
      };

      const result = userBaseSchema.parse(input);

      expect(result.operation).toBe("lookup");
      expect(result.runUserID).toBe("123456789012345678901234");
      expect(result.lookupUser?.amount).toBe(50);
      expect(result.lookupUser?.filter?.name).toBe("*john*");
      expect(result.lookupUser?.filter?.email).toBe("*test@example.com*");
      expect(result.lookupUser?.filter?.tags).toEqual([{ key: "role", value: "admin" }]);
    });
  });

  describe("validation errors", () => {
    it("should not reject missing operation (has default)", () => {
      // The operation field has a default value, so it won't throw
      const result = userBaseSchema.parse({});
      expect(result.operation).toBe("lookup");
    });

    it("should reject invalid operation", () => {
      expect(() => userBaseSchema.parse({ operation: "invalid" })).toThrow(ZodError);
    });

    it("should reject invalid runUserID length", () => {
      const input = { operation: "lookup" as const, runUserID: "short" };

      expect(() => userBaseSchema.parse(input)).toThrow(ZodError);
    });

    it("should not reject invalid field names (fields validation is open)", () => {
      const input = {
        operation: "lookup" as const,
        lookupUser: { fields: ["invalid_field"] },
      };

      // The current schema allows any string fields, so this won't throw
      const result = userBaseSchema.parse(input);
      expect(result.lookupUser?.fields).toEqual(["invalid_field"]);
    });

    it("should reject invalid filter.id length", () => {
      const input = {
        operation: "lookup" as const,
        lookupUser: { filter: { id: "short" } },
      };

      expect(() => userBaseSchema.parse(input)).toThrow(ZodError);
    });
  });

  describe("field transformations", () => {
    it("should wrap name and email filters with wildcards", () => {
      const input = {
        operation: "lookup" as const,
        lookupUser: {
          filter: {
            name: "john",
            email: "example.com",
          },
        },
      };

      const result = userBaseSchema.parse(input);

      expect(result.lookupUser?.filter?.name).toBe("*john*");
      expect(result.lookupUser?.filter?.email).toBe("*example.com*");
    });
  });
});
