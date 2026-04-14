import { describe, expect, it } from "vitest";
import { integrationBaseSchema } from "../integration-lookup";

describe("integrationBaseSchema Parse", () => {
  describe("Query Object Validation", () => {
    it("should require query field", () => {
      const result = integrationBaseSchema.safeParse({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["query"]);
        expect(result.error.issues[0].message).toBe("Required");
      }
    });

    it("should require query to be an object", () => {
      const result = integrationBaseSchema.safeParse({
        query: "not-an-object",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["query"]);
      }
    });

    it("should accept valid query object with connector only", () => {
      const result = integrationBaseSchema.safeParse({
        query: {
          connector: "test-connector",
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.connector).toBe("test-connector");
        expect(result.data.query.network).toBeUndefined();
      }
    });

    it("should accept valid query object with network only", () => {
      const result = integrationBaseSchema.safeParse({
        query: {
          network: "test-network",
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.network).toBe("test-network");
        expect(result.data.query.connector).toBeUndefined();
      }
    });

    it("should accept valid query object with both connector and network", () => {
      const result = integrationBaseSchema.safeParse({
        query: {
          connector: "test-connector",
          network: "test-network",
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.connector).toBe("test-connector");
        expect(result.data.query.network).toBe("test-network");
      }
    });

    it("should accept empty query object", () => {
      const result = integrationBaseSchema.safeParse({
        query: {},
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.connector).toBeUndefined();
        expect(result.data.query.network).toBeUndefined();
      }
    });
  });

  describe("Field Type Validation", () => {
    it("should reject non-string connector values", () => {
      const result = integrationBaseSchema.safeParse({
        query: {
          connector: 123,
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["query", "connector"]);
      }
    });

    it("should reject non-string network values", () => {
      const result = integrationBaseSchema.safeParse({
        query: {
          network: 123,
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["query", "network"]);
      }
    });
  });

  describe("Complete Valid Schemas", () => {
    it("should parse connector query", () => {
      const schema = {
        query: {
          connector: "HTTP Connector",
        },
      };

      const result = integrationBaseSchema.safeParse(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(schema);
      }
    });

    it("should parse network query", () => {
      const schema = {
        query: {
          network: "123456789012345678901234",
        },
      };

      const result = integrationBaseSchema.safeParse(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(schema);
      }
    });

    it("should parse mixed query with both connector and network", () => {
      const schema = {
        query: {
          connector: "HTTP",
          network: "LoRaWAN",
        },
      };

      const result = integrationBaseSchema.safeParse(schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(schema);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty string values", () => {
      const result = integrationBaseSchema.safeParse({
        query: {
          connector: "",
          network: "",
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.connector).toBe("");
        expect(result.data.query.network).toBe("");
      }
    });

    it("should handle special characters in strings", () => {
      const specialName = "Connector/with@special#chars$%^&*()";
      const result = integrationBaseSchema.safeParse({
        query: {
          connector: specialName,
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.connector).toBe(specialName);
      }
    });

    it("should handle very long strings", () => {
      const longString = "a".repeat(1000);
      const result = integrationBaseSchema.safeParse({
        query: {
          connector: longString,
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.connector).toBe(longString);
      }
    });
  });
});
