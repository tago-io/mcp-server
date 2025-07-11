import { describe, it, expect } from "vitest";
import { analysisBaseSchema } from "../analysis-operations";

describe("analysisBaseSchema validation", () => {
  describe("operation validation", () => {
    it("should accept valid operation 'lookup'", () => {
      const result = analysisBaseSchema.parse({ operation: "lookup" });
      expect(result.operation).toBe("lookup");
    });

    it("should reject invalid operation", () => {
      expect(() => analysisBaseSchema.parse({ operation: "invalid" })).toThrow();
    });

    it("should require operation field", () => {
      expect(() => analysisBaseSchema.parse({})).toThrow();
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
      expect(result.lookupAnalysis?.filter?.name).toBe("*test*"); // Should be transformed with wildcards
    });

    it("should transform name filter with wildcards", () => {
      const validData = {
        operation: "lookup" as const,
        lookupAnalysis: { filter: { name: "invoice" } },
      };

      const result = analysisBaseSchema.parse(validData);
      expect(result.lookupAnalysis?.filter?.name).toBe("*invoice*");
    });

    it("should validate runtime enum values", () => {
      const validData = { operation: "lookup" as const, lookupAnalysis: { filter: { runtime: "node" as const } } };
      const invalidData = { operation: "lookup" as const, lookupAnalysis: { filter: { runtime: "java" } } };

      expect(() => analysisBaseSchema.parse(validData)).not.toThrow();
      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });

    it("should validate run_on enum values", () => {
      const validData = { operation: "lookup" as const, lookupAnalysis: { filter: { run_on: "tago" as const } } };
      const invalidData = { operation: "lookup" as const, lookupAnalysis: { filter: { run_on: "cloud" } } };

      expect(() => analysisBaseSchema.parse(validData)).not.toThrow();
      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });

    it("should validate amount constraints", () => {
      const validData = { operation: "lookup" as const, lookupAnalysis: { amount: 5000 } };
      const invalidData = { operation: "lookup" as const, lookupAnalysis: { amount: 0 } };

      expect(() => analysisBaseSchema.parse(validData)).not.toThrow();
      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });

    it("should validate tags structure", () => {
      const validData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: { tags: [{ key: "environment", value: "production" }] },
        },
      };
      const invalidData = {
        operation: "lookup" as const,
        lookupAnalysis: {
          filter: { tags: [{ key: "environment" }] }, // missing value
        },
      };

      expect(() => analysisBaseSchema.parse(validData)).not.toThrow();
      expect(() => analysisBaseSchema.parse(invalidData)).toThrow();
    });
  });

  describe("complex scenarios", () => {
    it("should handle complex nested validation", () => {
      const complexData = {
        operation: "lookup" as const,
        analysisID: "507f1f77bcf86cd799439011",
        lookupAnalysis: {
          amount: 100,
          page: 2,
          fields: ["id", "name", "active"],
          filter: {
            name: "data_processor",
            runtime: "python" as const,
            run_on: "external" as const,
            tags: [{ key: "environment", value: "staging" }],
          },
        },
      };

      const result = analysisBaseSchema.parse(complexData);
      expect(result.lookupAnalysis?.filter?.name).toBe("*data_processor*");
      expect(result.analysisID).toBe("507f1f77bcf86cd799439011");
    });

    it("should strip unknown fields", () => {
      const result = analysisBaseSchema.safeParse({
        operation: "lookup",
        unknownField: "should be ignored",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect("unknownField" in result.data).toBe(false);
      }
    });
  });
});
