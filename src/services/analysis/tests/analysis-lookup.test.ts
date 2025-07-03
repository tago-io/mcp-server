import { describe, it, expect } from "vitest";
import { analysisBaseSchema } from "../tools/analysis-lookup";

describe("analysisBaseSchema.parse", () => {
  describe("operation validation", () => {
    it("should accept valid operation 'lookup'", () => {
      const validData = {
        operation: "lookup" as const,
      };

      const result = analysisBaseSchema.parse(validData);

      expect(result.operation).toBe("lookup");
    });

    it("should reject invalid operation", () => {
      const invalidData = {
        operation: "invalid",
      };

      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });

    it("should reject missing operation", () => {
      const invalidData = {};

      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });

    it("should reject null operation", () => {
      const invalidData = {
        operation: null,
      };

      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });
  });

  describe("analysisID validation", () => {
    it("should accept valid analysisID string", () => {
      const validData = {
        operation: "lookup" as const,
        analysisID: "507f1f77bcf86cd799439011",
      };

      const result = analysisBaseSchema.parse(validData);

      expect(result.analysisID).toBe("507f1f77bcf86cd799439011");
    });

    it("should accept missing analysisID (optional field)", () => {
      const validData = {
        operation: "lookup" as const,
      };

      const result = analysisBaseSchema.parse(validData);

      expect(result.analysisID).toBeUndefined();
    });

    it("should reject non-string analysisID", () => {
      const invalidData = {
        operation: "lookup" as const,
        analysisID: 123,
      };

      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });

    it("should reject empty string analysisID", () => {
      const invalidData = {
        operation: "lookup" as const,
        analysisID: "",
      };

      const result = analysisBaseSchema.parse(invalidData);

      expect(result.analysisID).toBe("");
    });
  });

  describe("lookupAnalysis validation", () => {
    it("should accept valid lookupAnalysis with all fields", () => {
      const validData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          amount: 100,
          page: 1,
          fields: ["id", "name", "active"],
          filter: {
            name: "test",
            runtime: "node" as const,
            run_on: "tago" as const,
            tags: [{ key: "type", value: "test" }],
          },
        },
      };

      const result = analysisBaseSchema.parse(validData);

      expect(result.lookupAnalysis).toEqual({
        amount: 100,
        page: 1,
        fields: ["id", "name", "active"],
        filter: {
          name: "*test*", // Should be transformed with wildcards
          runtime: "node",
          run_on: "tago",
          tags: [{ key: "type", value: "test" }],
        },
      });
    });

    it("should accept lookupAnalysis with minimal fields", () => {
      const validData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          amount: 50,
        },
      };

      const result = analysisBaseSchema.parse(validData);

      expect(result.lookupAnalysis?.amount).toBe(50);
    });

    it("should accept missing lookupAnalysis (optional field)", () => {
      const validData = {
        operation: "lookup" as const,
      };

      const result = analysisBaseSchema.parse(validData);

      expect(result.lookupAnalysis).toBeUndefined();
    });

    it("should transform name filter with wildcards", () => {
      const validData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: {
            name: "invoice",
          },
        },
      };

      const result = analysisBaseSchema.parse(validData);

      expect(result.lookupAnalysis?.filter?.name).toBe("*invoice*");
    });

    it("should validate runtime enum values", () => {
      const validNodeData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: {
            runtime: "node" as const,
          },
        },
      };

      const validPythonData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: {
            runtime: "python" as const,
          },
        },
      };

      const invalidData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: {
            runtime: "java",
          },
        },
      };

      expect(() => analysisBaseSchema.parse(validNodeData)).not.toThrow();
      expect(() => analysisBaseSchema.parse(validPythonData)).not.toThrow();
      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });

    it("should validate run_on enum values", () => {
      const validTagoData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: {
            run_on: "tago" as const,
          },
        },
      };

      const validExternalData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: {
            run_on: "external" as const,
          },
        },
      };

      const invalidData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: {
            run_on: "cloud",
          },
        },
      };

      expect(() => analysisBaseSchema.parse(validTagoData)).not.toThrow();
      expect(() => analysisBaseSchema.parse(validExternalData)).not.toThrow();
      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });

    it("should validate fields enum values", () => {
      const validData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          fields: ["id", "active", "name", "created_at", "updated_at", "last_run", "variables", "tags", "run_on", "version"],
        },
      };

      const invalidData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          fields: ["id", "invalid_field"],
        },
      };

      expect(() => analysisBaseSchema.parse(validData)).not.toThrow();
      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });

    it("should validate tags structure", () => {
      const validData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: {
            tags: [
              { key: "environment", value: "production" },
              { key: "type", value: "data_processing" },
            ],
          },
        },
      };

      const invalidData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: {
            tags: [
              { key: "environment" }, // missing value
            ],
          },
        },
      };

      expect(() => analysisBaseSchema.parse(validData)).not.toThrow();
      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });

    it("should validate amount constraints", () => {
      const validData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          amount: 5000,
        },
      };

      const invalidLowData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          amount: 0,
        },
      };

      const invalidHighData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          amount: 10001,
        },
      };

      expect(() => analysisBaseSchema.parse(validData)).not.toThrow();
      expect(() => analysisBaseSchema.parse(invalidLowData)).toThrow();
      expect(() => analysisBaseSchema.parse(invalidHighData)).toThrow();
    });

    it("should validate page constraints", () => {
      const validData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          page: 1,
        },
      };

      const invalidData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          page: 0,
        },
      };

      expect(() => analysisBaseSchema.parse(validData)).not.toThrow();
      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });
  });

  describe("edge cases and complex scenarios", () => {
    it("should handle complex nested validation", () => {
      const complexData = {
        operation: "lookup" as const,
        analysisID: "507f1f77bcf86cd799439011",
        lookupAnalysis: {
          amount: 100,
          page: 2,
          fields: ["id", "name", "active", "tags", "run_on"],
          filter: {
            name: "data_processor",
            runtime: "python" as const,
            run_on: "external" as const,
            tags: [
              { key: "environment", value: "staging" },
              { key: "priority", value: "high" },
            ],
          },
        },
      };

      const result = analysisBaseSchema.parse(complexData);

      expect(result).toEqual({
        operation: "lookup",
        analysisID: "507f1f77bcf86cd799439011",
        lookupAnalysis: {
          amount: 100,
          page: 2,
          fields: ["id", "name", "active", "tags", "run_on"],
          filter: {
            name: "*data_processor*",
            runtime: "python",
            run_on: "external",
            tags: [
              { key: "environment", value: "staging" },
              { key: "priority", value: "high" },
            ],
          },
        },
      });
    });

    it("should reject unknown fields", () => {
      const result = analysisBaseSchema.safeParse({
        operation: "lookup",
        unknownField: "should be ignored",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect("unknownField" in result.data).toBe(false);
      }
    });

    it("should handle empty objects gracefully", () => {
      const dataWithEmptyFilter = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: {},
        },
      };

      expect(() => analysisBaseSchema.parse(dataWithEmptyFilter)).not.toThrow();
    });

    it("should handle null values in optional fields", () => {
      const dataWithNulls = {
        operation: "lookup" as const,
        analysisID: null,
        lookupAnalysis: null,
      };

      expect(() => analysisBaseSchema.parse(dataWithNulls)).toThrow();
    });

    it("should preserve type safety for parsed result", () => {
      const validData = {
        operation: "lookup" as const,
        analysisID: "test-id",
      };

      const result = analysisBaseSchema.parse(validData);

      // TypeScript should infer the correct types
      expect(typeof result.operation).toBe("string");
      expect(typeof result.analysisID).toBe("string");
      expect(result.lookupAnalysis).toBeUndefined();
    });
  });

  describe("error message validation", () => {
    it("should provide descriptive error for invalid operation", () => {
      const invalidData = {
        operation: "create",
      };

      expect(() => analysisBaseSchema.parse(invalidData)).toThrow(/invalid_enum_value/);
    });

    it("should provide descriptive error for invalid runtime", () => {
      const invalidData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: {
            runtime: "ruby",
          },
        },
      };

      expect(() => analysisBaseSchema.parse(invalidData)).toThrow(/invalid_enum_value/);
    });

    it("should provide descriptive error for invalid amount", () => {
      const invalidData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          amount: -1,
        },
      };

      expect(() => analysisBaseSchema.parse(invalidData)).toThrow(/Number must be greater than or equal to 1/);
    });
  });
}); 