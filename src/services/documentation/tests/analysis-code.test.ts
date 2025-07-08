import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod/v3";
import { analysisCodeBaseSchema } from "../tools/analysis-code";

vi.mock("../../../utils/get-env-variables", () => ({
  ENV: {
    TAGOIO_TOKEN: "test",
  },
}));

describe("analysisCodeBaseSchema", () => {
  describe("valid inputs", () => {
    it("should parse valid input with minimal required fields", () => {
      const validInput = {
        lookupCodeQuestions: ["How to create a device?"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toEqual(["How to create a device?"]);
      expect(result.type).toBe("analysis");
    });

    it("should parse input with analysis type", () => {
      const validInput = {
        lookupCodeQuestions: ["How to send data to device?", "How to get device info?"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toEqual([
        "How to send data to device?",
        "How to get device info?",
      ]);
      expect(result.type).toBe("analysis");
    });

    it("should parse input with payload-parser type", () => {
      const validInput = {
        lookupCodeQuestions: ["How to decode sensor data?"],
        type: "payload-parser" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toEqual(["How to decode sensor data?"]);
      expect(result.type).toBe("payload-parser");
    });

    it("should parse input with maximum allowed questions (5)", () => {
      const validInput = {
        lookupCodeQuestions: [
          "Question 1",
          "Question 2",
          "Question 3",
          "Question 4",
          "Question 5",
        ],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toHaveLength(5);
      expect(result.type).toBe("analysis");
    });

    it("should parse input with complex questions", () => {
      const validInput = {
        lookupCodeQuestions: [
          "How to create a device with specific tags?",
          "How to handle device data validation?",
          "How to set up device alerts and notifications?",
        ],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toHaveLength(3);
      expect(result.lookupCodeQuestions[0]).toBe("How to create a device with specific tags?");
      expect(result.type).toBe("analysis");
    });

    it("should accept questions with special characters", () => {
      const validInput = {
        lookupCodeQuestions: [
          "How to create a device with name 'Test Device'?",
          "How to handle data with special chars: @#$%^&*(){}[]|\\:;\"'<>,.?/~`",
          "How to process UTF-8 characters: éñüñ中文日本語",
        ],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toHaveLength(3);
      expect(result.lookupCodeQuestions[1]).toContain("@#$%^&*(){}[]|\\:;\"'<>,.?/~`");
      expect(result.lookupCodeQuestions[2]).toContain("éñüñ中文日本語");
    });

    it("should accept very long questions", () => {
      const longQuestion = "How to create a device with a very long description that contains multiple sentences and detailed information about the device configuration, including its sensors, actuators, and communication protocols, and how to properly initialize all the required parameters for optimal performance in a production environment?";
      
      const validInput = {
        lookupCodeQuestions: [longQuestion],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions[0]).toBe(longQuestion);
    });
  });

  describe("lookupCodeQuestions validation", () => {
    it("should reject empty array", () => {
      const invalidInput = {
        lookupCodeQuestions: [],
        type: "analysis" as const,
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["lookupCodeQuestions"]);
        expect(zodError.errors[0].code).toBe("too_small");
        expect(zodError.errors[0].message).toContain("at least 1");
      }
    });

    it("should reject array with more than 5 questions", () => {
      const invalidInput = {
        lookupCodeQuestions: [
          "Question 1",
          "Question 2",
          "Question 3",
          "Question 4",
          "Question 5",
          "Question 6", // This exceeds the limit
        ],
        type: "analysis" as const,
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["lookupCodeQuestions"]);
        expect(zodError.errors[0].code).toBe("too_big");
        expect(zodError.errors[0].message).toContain("at most 5");
      }
    });

    it("should reject non-array value", () => {
      const invalidInput = {
        lookupCodeQuestions: "not an array",
        type: "analysis" as const,
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["lookupCodeQuestions"]);
        expect(zodError.errors[0].code).toBe("invalid_type");
        expect(zodError.errors[0].message).toContain("Expected array");
      }
    });

    it("should reject array with non-string elements", () => {
      const invalidInput = {
        lookupCodeQuestions: ["Valid question", 123, "Another valid question"],
        type: "analysis" as const,
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["lookupCodeQuestions", 1]);
        expect(zodError.errors[0].code).toBe("invalid_type");
        expect(zodError.errors[0].message).toContain("Expected string");
      }
    });

    it("should reject array with null elements", () => {
      const invalidInput = {
        lookupCodeQuestions: ["Valid question", null, "Another valid question"],
        type: "analysis" as const,
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["lookupCodeQuestions", 1]);
        expect(zodError.errors[0].code).toBe("invalid_type");
      }
    });

    it("should reject array with undefined elements", () => {
      const invalidInput = {
        lookupCodeQuestions: ["Valid question", undefined, "Another valid question"],
        type: "analysis" as const,
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["lookupCodeQuestions", 1]);
        expect(zodError.errors[0].code).toBe("invalid_type");
      }
    });

    it("should accept array with empty string elements", () => {
      const validInput = {
        lookupCodeQuestions: ["Valid question", "", "Another valid question"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toEqual(["Valid question", "", "Another valid question"]);
      expect(result.type).toBe("analysis");
    });

    it("should reject missing lookupCodeQuestions field", () => {
      const invalidInput = {
        type: "analysis" as const,
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["lookupCodeQuestions"]);
        expect(zodError.errors[0].code).toBe("invalid_type");
        expect(zodError.errors[0].message).toBe("Required");
      }
    });
  });

  describe("type validation", () => {
    it("should accept 'analysis' type", () => {
      const validInput = {
        lookupCodeQuestions: ["How to create analysis?"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.type).toBe("analysis");
    });

    it("should accept 'payload-parser' type", () => {
      const validInput = {
        lookupCodeQuestions: ["How to parse payload?"],
        type: "payload-parser" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.type).toBe("payload-parser");
    });

    it("should reject invalid type", () => {
      const invalidInput = {
        lookupCodeQuestions: ["How to create analysis?"],
        type: "invalid-type",
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["type"]);
        expect(zodError.errors[0].code).toBe("invalid_enum_value");
        expect(zodError.errors[0].message).toContain("Invalid enum value");
      }
    });

    it("should reject missing type field", () => {
      const invalidInput = {
        lookupCodeQuestions: ["How to create analysis?"],
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["type"]);
        expect(zodError.errors[0].code).toBe("invalid_type");
        expect(zodError.errors[0].message).toBe("Required");
      }
    });

    it("should reject non-string type", () => {
      const invalidInput = {
        lookupCodeQuestions: ["How to create analysis?"],
        type: 123,
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["type"]);
        expect(zodError.errors[0].code).toBe("invalid_type");
        expect(zodError.errors[0].message).toContain("Expected 'analysis' | 'payload-parser', received number");
      }
    });

    it("should reject null type", () => {
      const invalidInput = {
        lookupCodeQuestions: ["How to create analysis?"],
        type: null,
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["type"]);
        expect(zodError.errors[0].code).toBe("invalid_type");
      }
    });

    it("should reject empty string type", () => {
      const invalidInput = {
        lookupCodeQuestions: ["How to create analysis?"],
        type: "",
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["type"]);
        expect(zodError.errors[0].code).toBe("invalid_enum_value");
      }
    });
  });

  describe("boundary conditions", () => {
    it("should accept exactly 1 question (minimum)", () => {
      const validInput = {
        lookupCodeQuestions: ["How to create a device?"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toHaveLength(1);
      expect(result.lookupCodeQuestions[0]).toBe("How to create a device?");
    });

    it("should accept exactly 5 questions (maximum)", () => {
      const validInput = {
        lookupCodeQuestions: [
          "Question 1",
          "Question 2",
          "Question 3",
          "Question 4",
          "Question 5",
        ],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toHaveLength(5);
    });

    it("should accept 3 questions (middle range)", () => {
      const validInput = {
        lookupCodeQuestions: [
          "How to create devices?",
          "How to manage device data?",
          "How to set up alerts?",
        ],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toHaveLength(3);
    });
  });

  describe("edge cases", () => {
    it("should reject completely empty input", () => {
      const invalidInput = {};

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors).toHaveLength(2); // Both fields are required
        expect(zodError.errors.some(e => e.path[0] === "lookupCodeQuestions")).toBe(true);
        expect(zodError.errors.some(e => e.path[0] === "type")).toBe(true);
      }
    });

    it("should reject null input", () => {
      const invalidInput = null;

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].code).toBe("invalid_type");
        expect(zodError.errors[0].message).toContain("Expected object");
      }
    });

    it("should reject undefined input", () => {
      const invalidInput = undefined;

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].code).toBe("invalid_type");
        expect(zodError.errors[0].message).toContain("Required");
      }
    });

    it("should reject string input", () => {
      const invalidInput = "not an object";

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].code).toBe("invalid_type");
        expect(zodError.errors[0].message).toContain("Expected object");
      }
    });

    it("should reject array input", () => {
      const invalidInput = ["not", "an", "object"];

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].code).toBe("invalid_type");
        expect(zodError.errors[0].message).toContain("Expected object");
      }
    });

    it("should handle mixed valid and invalid nested data", () => {
      const invalidInput = {
        lookupCodeQuestions: ["Valid question", 123, "Another valid question"],
        type: "analysis" as const,
      };

      expect(() => analysisCodeBaseSchema.parse(invalidInput)).toThrow(ZodError);

      try {
        analysisCodeBaseSchema.parse(invalidInput);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors[0].path).toEqual(["lookupCodeQuestions", 1]);
        expect(zodError.errors[0].code).toBe("invalid_type");
      }
    });
  });

  describe("safeParse usage", () => {
    it("should return success: true for valid input", () => {
      const validInput = {
        lookupCodeQuestions: ["How to create a device?"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.safeParse(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupCodeQuestions).toEqual(["How to create a device?"]);
        expect(result.data.type).toBe("analysis");
      }
    });

    it("should return success: false for invalid input", () => {
      const invalidInput = {
        lookupCodeQuestions: [],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["lookupCodeQuestions"]);
        expect(result.error.issues[0].code).toBe("too_small");
      }
    });

    it("should return success: false for too many questions", () => {
      const invalidInput = {
        lookupCodeQuestions: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["lookupCodeQuestions"]);
        expect(result.error.issues[0].code).toBe("too_big");
      }
    });

    it("should return success: false for invalid type", () => {
      const invalidInput = {
        lookupCodeQuestions: ["How to create analysis?"],
        type: "invalid-type",
      };

      const result = analysisCodeBaseSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["type"]);
        expect(result.error.issues[0].code).toBe("invalid_enum_value");
      }
    });
  });

  describe("real-world scenarios", () => {
    it("should handle typical analysis questions", () => {
      const validInput = {
        lookupCodeQuestions: [
          "How to create a new device?",
          "How to send data to TagoIO?",
          "How to process incoming sensor data?",
          "How to set up device alerts?",
        ],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toHaveLength(4);
      expect(result.type).toBe("analysis");
    });

    it("should handle typical payload-parser questions", () => {
      const validInput = {
        lookupCodeQuestions: [
          "How to decode LoRaWAN payload?",
          "How to parse JSON sensor data?",
          "How to handle binary data formats?",
        ],
        type: "payload-parser" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toHaveLength(3);
      expect(result.type).toBe("payload-parser");
    });

    it("should handle single question scenario", () => {
      const validInput = {
        lookupCodeQuestions: ["How to initialize a new sensor device?"],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toHaveLength(1);
      expect(result.lookupCodeQuestions[0]).toBe("How to initialize a new sensor device?");
    });

    it("should handle maximum questions scenario", () => {
      const validInput = {
        lookupCodeQuestions: [
          "How to create devices?",
          "How to manage device data?",
          "How to set up alerts?",
          "How to configure dashboards?",
          "How to handle device errors?",
        ],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions).toHaveLength(5);
      expect(result.type).toBe("analysis");
    });
  });

  describe("data consistency", () => {
    it("should maintain question order", () => {
      const validInput = {
        lookupCodeQuestions: [
          "First question",
          "Second question", 
          "Third question",
        ],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions[0]).toBe("First question");
      expect(result.lookupCodeQuestions[1]).toBe("Second question");
      expect(result.lookupCodeQuestions[2]).toBe("Third question");
    });

    it("should preserve question content exactly", () => {
      const complexQuestion = "How to create a device with tags: {'sensor': 'temperature', 'location': 'office'} and handle special characters?";
      const validInput = {
        lookupCodeQuestions: [complexQuestion],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions[0]).toBe(complexQuestion);
    });

    it("should handle whitespace in questions", () => {
      const validInput = {
        lookupCodeQuestions: [
          "  How to create a device?  ",
          "\nHow to handle line breaks?\n",
          "\tHow to handle tabs?\t",
        ],
        type: "analysis" as const,
      };

      const result = analysisCodeBaseSchema.parse(validInput);

      expect(result.lookupCodeQuestions[0]).toBe("  How to create a device?  ");
      expect(result.lookupCodeQuestions[1]).toBe("\nHow to handle line breaks?\n");
      expect(result.lookupCodeQuestions[2]).toBe("\tHow to handle tabs?\t");
    });
  });
}); 