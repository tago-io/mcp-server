import { describe, it, expect, vi } from "vitest";
import { documentationBaseSchema } from "../documentation-lookup";

vi.mock("../../../../utils/get-env-variables", () => ({
  ENV: {
    TAGOIO_TOKEN: "test",
  },
}));

describe("documentationBaseSchema", () => {
  describe("valid inputs", () => {
    it("should accept single and multiple questions", () => {
      const singleQuestion = {
        search: ["How to configure a dashboard?"],
      };

      const multipleQuestions = {
        search: ["How to configure a dashboard?", "How to configure a widget?", "Dashboard setup"],
      };

      expect(documentationBaseSchema.safeParse(singleQuestion).success).toBe(true);
      expect(documentationBaseSchema.safeParse(multipleQuestions).success).toBe(true);

      const multiResult = documentationBaseSchema.parse(multipleQuestions);
      expect(multiResult.search).toHaveLength(3);
    });

    it("should accept exactly 5 questions (maximum limit)", () => {
      const maxQuestions = {
        search: ["Q1", "Q2", "Q3", "Q4", "Q5"],
      };

      const result = documentationBaseSchema.safeParse(maxQuestions);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toHaveLength(5);
      }
    });
  });

  describe("invalid inputs", () => {
    it("should reject empty array and arrays exceeding limit", () => {
      const emptyArray = { search: [] };
      const tooManyQuestions = { search: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"] };

      expect(documentationBaseSchema.safeParse(emptyArray).success).toBe(false);
      expect(documentationBaseSchema.safeParse(tooManyQuestions).success).toBe(false);
    });

    it("should reject non-string elements and invalid types", () => {
      const withNumbers = { search: ["Valid question", 123] };
      const withBooleans = { search: ["Valid question", true] };
      const notArray = { search: "Not an array" };
      const missingField = {};

      [withNumbers, withBooleans, notArray, missingField].forEach((input) => {
        expect(documentationBaseSchema.safeParse(input).success).toBe(false);
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty strings and whitespace", () => {
      const withEmptyStrings = { search: ["", "   ", "Valid question"] };

      const result = documentationBaseSchema.safeParse(withEmptyStrings);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toHaveLength(3);
      }
    });

    it("should preserve question order", () => {
      const orderedQuestions = {
        search: ["First", "Second", "Third"],
      };

      const result = documentationBaseSchema.parse(orderedQuestions);
      expect(result.search).toEqual(["First", "Second", "Third"]);
    });
  });

  describe("schema metadata", () => {
    it("should have proper descriptions", () => {
      expect(documentationBaseSchema.description).toBe("Schema for the documentation operation");

      const shape = documentationBaseSchema.shape;
      expect(shape.search.description).toContain("questions to search for documentation");
      expect(shape.search.description).toContain("at least 1 question and maximum 5 questions");
    });
  });
});
