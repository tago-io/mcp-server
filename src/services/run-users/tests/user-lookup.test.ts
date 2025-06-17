import { describe, it, expect } from "vitest";

import { userListSchema } from "../tools/user-lookup";

describe("User Models", () => {
  describe("userListSchema", () => {
    it("should validate valid fields array", () => {
      const result = userListSchema.shape.fields.safeParse(["name", "email", "active"]);
      expect(result.success).toBe(true);
    });

    it("should reject invalid fields", () => {
      const result = userListSchema.shape.fields.safeParse(["invalid_field"]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid enum value");
      }
    });

    it("should accept undefined fields", () => {
      const result = userListSchema.shape.fields.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it("should validate complete valid object", () => {
      const validObject = {
        amount: 100,
        fields: ["name", "email", "active"],
      };
      const result = userListSchema.safeParse(validObject);
      expect(result.success).toBe(true);
    });

    it("should transform name filter with wildcard matching", () => {
      const validInput = {
        filter: {
          name: "john",
        },
      };
      const result = userListSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      expect(result.data?.filter?.name).toBe("*john*");
    });

    it("should transform email filter with wildcard matching", () => {
      const validInput = {
        filter: {
          email: "gmail",
        },
      };
      const result = userListSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      expect(result.data?.filter?.email).toBe("*gmail*");
    });

    it("should validate user ID filter", () => {
      const validInput = {
        filter: {
          id: "123456789012345678901234",
        },
      };
      const result = userListSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("should reject invalid user ID length", () => {
      const invalidInput = {
        filter: {
          id: "123",
        },
      };
      const result = userListSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("ID must be 24 characters long");
      }
    });

    it("should validate active status filter", () => {
      const validInput = {
        filter: {
          active: true,
        },
      };
      const result = userListSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });
  });
});
