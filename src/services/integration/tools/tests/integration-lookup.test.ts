import { describe, it, expect } from "vitest";
import { integrationBaseSchema } from "../integration-lookup";

describe("integrationBaseSchema Parse", () => {
  describe("Query Array Validation", () => {
    it("should require query field", () => {
      const result = integrationBaseSchema.safeParse({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["query"]);
        expect(result.error.issues[0].message).toBe("Required");
      }
    });

    it("should require query to be an array", () => {
      const result = integrationBaseSchema.safeParse({
        query: "not-an-array",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["query"]);
      }
    });

    it("should require at least one query object", () => {
      const result = integrationBaseSchema.safeParse({
        query: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("too_small");
        expect(result.error.issues[0].path).toEqual(["query"]);
      }
    });

    it("should accept valid query array with single object", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            name: "test-connector",
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toHaveLength(1);
        expect(result.data.query[0].type).toBe("connector");
        expect(result.data.query[0].name).toBe("test-connector");
      }
    });

    it("should accept valid query array with multiple objects", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            name: "test-connector",
          },
          {
            type: "network",
            id: "123456789012345678901234",
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toHaveLength(2);
        expect(result.data.query[0].type).toBe("connector");
        expect(result.data.query[1].type).toBe("network");
      }
    });
  });

  describe("Query Object Type Validation", () => {
    it("should require type field", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            name: "test-connector",
          },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["query", 0, "type"]);
      }
    });

    it("should accept 'connector' type", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            name: "test-connector",
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query[0].type).toBe("connector");
      }
    });

    it("should accept 'network' type", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "network",
            name: "test-network",
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query[0].type).toBe("network");
      }
    });

    it("should reject invalid type values", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "invalid-type",
            name: "test",
          },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_enum_value");
        expect(result.error.issues[0].path).toEqual(["query", 0, "type"]);
      }
    });
  });

  describe("Query Object ID and Name Validation", () => {
    it("should accept valid ID", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            id: "123456789012345678901234",
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query[0].id).toBe("123456789012345678901234");
      }
    });

    it("should accept valid name", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            name: "Test Connector",
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query[0].name).toBe("Test Connector");
      }
    });

    it("should accept both ID and name", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            id: "123456789012345678901234",
            name: "Test Connector",
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query[0].id).toBe("123456789012345678901234");
        expect(result.data.query[0].name).toBe("Test Connector");
      }
    });

    it("should reject non-string ID values", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            id: 123,
          },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["query", 0, "id"]);
      }
    });

    it("should reject non-string name values", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            name: 123,
          },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["query", 0, "name"]);
      }
    });
  });

  describe("Query Object Public Field Validation", () => {
    it("should accept true public value", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            name: "test-connector",
            public: true,
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query[0].public).toBe(true);
      }
    });

    it("should accept false public value", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            name: "test-connector",
            public: false,
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query[0].public).toBe(false);
      }
    });

    it("should accept undefined public value", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            name: "test-connector",
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query[0].public).toBeUndefined();
      }
    });

    it("should reject non-boolean public values", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            name: "test-connector",
            public: "true",
          },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["query", 0, "public"]);
      }
    });
  });

  describe("Complete Valid Schemas", () => {
    it("should parse connector query with name only", () => {
      const schema = {
        query: [
          {
            type: "connector",
            name: "HTTP Connector",
          },
        ],
      };

      const result = integrationBaseSchema.safeParse(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(schema);
      }
    });

    it("should parse network query with ID only", () => {
      const schema = {
        query: [
          {
            type: "network",
            id: "123456789012345678901234",
          },
        ],
      };

      const result = integrationBaseSchema.safeParse(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(schema);
      }
    });

    it("should parse mixed query types", () => {
      const schema = {
        query: [
          {
            type: "connector",
            name: "HTTP",
            public: false,
          },
          {
            type: "network",
            id: "123456789012345678901234",
          },
          {
            type: "connector",
            id: "987654321098765432109876",
            name: "LoRaWAN Connector",
          },
        ],
      };

      const result = integrationBaseSchema.safeParse(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(schema);
        expect(result.data.query).toHaveLength(3);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty string values", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            id: "",
            name: "",
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query[0].id).toBe("");
        expect(result.data.query[0].name).toBe("");
      }
    });

    it("should handle special characters in strings", () => {
      const specialName = "Connector/with@special#chars$%^&*()";
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            name: specialName,
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query[0].name).toBe(specialName);
      }
    });

    it("should handle very long strings", () => {
      const longString = "a".repeat(1000);
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "connector",
            name: longString,
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query[0].name).toBe(longString);
      }
    });
  });

  describe("Error Message Quality", () => {
    it("should provide clear error for missing required fields", () => {
      const result = integrationBaseSchema.safeParse({
        query: [{}],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const typeError = result.error.issues.find((issue) => issue.path.join(".") === "query.0.type");
        expect(typeError?.message).toBe("Required");
      }
    });

    it("should provide clear error for invalid enum values", () => {
      const result = integrationBaseSchema.safeParse({
        query: [
          {
            type: "invalid",
            name: "test",
          },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const enumError = result.error.issues.find((issue) => issue.code === "invalid_enum_value");
        expect(enumError?.message).toContain("Invalid enum value");
      }
    });
  });
});
