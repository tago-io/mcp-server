import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod/v3";
import { analysisCodeBaseSchema } from "../analysis-code";

vi.mock("../../../../utils/get-env-variables", () => ({
  ENV: {
    TAGOIO_TOKEN: "test",
  },
}));

describe("analysisCodeBaseSchema", () => {
  describe("valid inputs", () => {
    it("should parse minimal valid input", () => {
      const input = {
        search: ["How to create a device?"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(input);

      expect(result.search).toEqual(["How to create a device?"]);
      expect(result.type).toBe("analysis");
    });

    it("should parse multiple questions", () => {
      const input = {
        search: ["How to send data?", "How to get device info?"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(input);

      expect(result.search).toHaveLength(2);
      expect(result.type).toBe("analysis");
    });

    it("should parse payload-parser type", () => {
      const input = {
        search: ["How to decode sensor data?"],
        type: "payload-parser" as const,
      };

      const result = analysisCodeBaseSchema.parse(input);

      expect(result.type).toBe("payload-parser");
    });

    it("should accept maximum 5 questions", () => {
      const input = {
        search: ["Q1", "Q2", "Q3", "Q4", "Q5"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(input);

      expect(result.search).toHaveLength(5);
    });

    it("should handle special characters and unicode", () => {
      const input = {
        search: ["How to create 'Test Device'?", "Handle chars: @#$%^&*()", "UTF-8: éñüñ中文日本語"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(input);

      expect(result.search).toHaveLength(3);
      expect(result.search[2]).toContain("éñüñ中文日本語");
    });
  });

  describe("validation errors", () => {
    it("should reject empty search array", () => {
      const input = {
        search: [],
        type: "analysis" as const,
      };

      expect(() => analysisCodeBaseSchema.parse(input)).toThrow(ZodError);
    });

    it("should reject more than 5 questions", () => {
      const input = {
        search: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"],
        type: "analysis" as const,
      };

      expect(() => analysisCodeBaseSchema.parse(input)).toThrow(ZodError);
    });

    it("should reject invalid type", () => {
      const input = {
        search: ["How to create analysis?"],
        type: "invalid-type" as any,
      };

      expect(() => analysisCodeBaseSchema.parse(input)).toThrow(ZodError);
    });

    it("should reject non-string search elements", () => {
      const input = {
        search: ["Valid question", 123, "Another valid question"],
        type: "analysis" as const,
      };

      expect(() => analysisCodeBaseSchema.parse(input)).toThrow(ZodError);
    });

    it("should reject missing required fields", () => {
      expect(() => analysisCodeBaseSchema.parse({})).toThrow(ZodError);
      expect(() => analysisCodeBaseSchema.parse({ search: ["test"] })).toThrow(ZodError);
      expect(() => analysisCodeBaseSchema.parse({ type: "analysis" })).toThrow(ZodError);
    });

    it("should reject invalid input types", () => {
      expect(() => analysisCodeBaseSchema.parse(null)).toThrow(ZodError);
      expect(() => analysisCodeBaseSchema.parse("not an object")).toThrow(ZodError);
      expect(() => analysisCodeBaseSchema.parse(["not", "an", "object"])).toThrow(ZodError);
    });
  });

  describe("boundary conditions", () => {
    it("should accept exactly 1 question (minimum)", () => {
      const input = {
        search: ["Single question"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(input);
      expect(result.search).toHaveLength(1);
    });

    it("should accept exactly 5 questions (maximum)", () => {
      const input = {
        search: ["Q1", "Q2", "Q3", "Q4", "Q5"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(input);
      expect(result.search).toHaveLength(5);
    });

    it("should preserve question order and content", () => {
      const questions = ["First question", "Second question", "Third question"];
      const input = {
        search: questions,
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(input);
      expect(result.search).toEqual(questions);
    });
  });

  describe("safeParse functionality", () => {
    it("should return success: true for valid input", () => {
      const input = {
        search: ["Valid question"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toEqual(["Valid question"]);
      }
    });

    it("should return success: false for invalid input", () => {
      const input = {
        search: [],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("too_small");
      }
    });
  });

  describe("real-world scenarios", () => {
    it("should handle typical analysis questions", () => {
      const input = {
        search: ["How to create a new device?", "How to send data to TagoIO?", "How to set up device alerts?"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(input);
      expect(result.search).toHaveLength(3);
      expect(result.type).toBe("analysis");
    });

    it("should handle payload-parser questions", () => {
      const input = {
        search: ["How to decode LoRaWAN payload?", "How to parse JSON sensor data?"],
        type: "payload-parser" as const,
      };

      const result = analysisCodeBaseSchema.parse(input);
      expect(result.search).toHaveLength(2);
      expect(result.type).toBe("payload-parser");
    });
  });
});
