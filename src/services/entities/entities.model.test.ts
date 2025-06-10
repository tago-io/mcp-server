import { z } from "zod/v3";
import { describe, it, expect } from "vitest";

import { entityListModel } from "./entities.model.js";

describe("Entity Models", () => {
  describe("entityListModel", () => {
    const schema = z.object(entityListModel);

    it("should validate a valid entity list query with all fields", () => {
      const validInput = {
        fields: ["id", "name", "schema", "index", "tags", "payload_decoder", "created_at", "updated_at"],
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should validate a valid entity list query with subset of fields", () => {
      const validInput = {
        fields: ["id", "name", "schema", "tags"],
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should validate a valid entity list query with single field", () => {
      const validInput = {
        fields: ["name"],
      };
      expect(() => schema.parse(validInput)).not.toThrow();
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
