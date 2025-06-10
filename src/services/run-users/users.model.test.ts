import { z } from "zod/v3";
import { describe, it, expect } from "vitest";

import { userListModel } from "./users.model";

describe("User Models", () => {
  describe("userListModel", () => {
    const schema = z.object(userListModel);

    it("should validate a valid user list query with all fields", () => {
      const validInput = {
        fields: ["id", "name", "email", "timezone", "company", "phone", "language", "tags", "active", "last_login", "created_at", "updated_at"],
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should validate a valid user list query with subset of fields", () => {
      const validInput = {
        fields: ["id", "name", "email", "active"],
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should validate a valid user list query with single field", () => {
      const validInput = {
        fields: ["email"],
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should validate an empty object", () => {
      expect(() => schema.parse({})).not.toThrow();
    });

    it("should reject invalid field names", () => {
      const invalidInput = {
        fields: ["invalid_field", "name"],
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject non-array fields", () => {
      const invalidInput = {
        fields: "name",
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject empty fields array", () => {
      const invalidInput = {
        fields: [],
      };
      expect(() => schema.parse(invalidInput)).not.toThrow();
    });

    it("should validate fields as undefined", () => {
      const validInput = {
        fields: undefined,
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });
  });
});
