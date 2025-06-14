import { z } from "zod/v3";
import { describe, it, expect } from "vitest";

import { entityListSchema } from "../tools/entity-lookup";

describe("Entity Models", () => {
  describe("entityListSchema", () => {
    it("should validate valid fields array", () => {
      const result = entityListSchema.fields.safeParse(["name", "schema", "created_at"]);
      expect(result.success).toBe(true);
    });

    it("should reject invalid fields", () => {
      const result = entityListSchema.fields.safeParse(["invalid_field"]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid enum value");
      }
    });

    it("should accept undefined fields", () => {
      const result = entityListSchema.fields.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it("should validate complete valid object", () => {
      const validObject = {
        amount: 100,
        fields: ["name", "schema", "created_at"],
      };
      const schema = z.object(entityListSchema);
      const result = schema.safeParse(validObject);
      expect(result.success).toBe(true);
    });

    it("should transform name filter with wildcard matching", () => {
      const validInput = {
        filter: {
          name: "sensor",
        },
      };
      const schema = z.object(entityListSchema);
      const result = schema.safeParse(validInput);
      expect(result.success).toBe(true);
      expect(result.data?.filter?.name).toBe("*sensor*");
    });

    it("should validate entity ID filter", () => {
      const validInput = {
        filter: {
          id: "123456789012345678901234",
        },
      };
      const schema = z.object(entityListSchema);
      const result = schema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("should reject invalid entity ID length", () => {
      const invalidInput = {
        filter: {
          id: "123",
        },
      };
      const schema = z.object(entityListSchema);
      const result = schema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("ID must be 24 characters long");
      }
    });
  });
});
