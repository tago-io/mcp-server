import { describe, it, expect } from "vitest";
import { integrationBaseSchema } from "../tools/integration-lookup";

describe("integrationBaseSchema Parse", () => {
  describe("Operation Validation", () => {
    it("should accept valid operation type", () => {
      const result = integrationBaseSchema.safeParse({ 
        operation: "lookup",
        query: {}
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe("lookup");
      }
    });

    it("should reject invalid operation types", () => {
      const invalidOperations = ["invalid", "create", "update", "delete", "get", "patch", "remove", ""];
      
      for (const operation of invalidOperations) {
        const result = integrationBaseSchema.safeParse({ 
          operation,
          query: {}
        });
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("invalid_enum_value");
          expect(result.error.issues[0].path).toEqual(["operation"]);
        }
      }
    });

    it("should require operation field", () => {
      const result = integrationBaseSchema.safeParse({ query: {} });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["operation"]);
        expect(result.error.issues[0].message).toBe("Required");
      }
    });

    it("should reject non-string operation values", () => {
      const nonStringOperations = [123, true, null, [], {}];
      
      for (const operation of nonStringOperations) {
        const result = integrationBaseSchema.safeParse({ 
          operation,
          query: {}
        });
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("invalid_type");
          expect(result.error.issues[0].path).toEqual(["operation"]);
        }
      }
    });
  });

  describe("Query Object Validation", () => {
    it("should accept empty query object", () => {
      const result = integrationBaseSchema.safeParse({
        operation: "lookup",
        query: {}
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toEqual({});
      }
    });

    it("should accept query with connector only", () => {
      const result = integrationBaseSchema.safeParse({
        operation: "lookup",
        query: {
          connector: "test-connector"
        }
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.connector).toBe("test-connector");
        expect(result.data.query.network).toBeUndefined();
      }
    });

    it("should accept query with network only", () => {
      const result = integrationBaseSchema.safeParse({
        operation: "lookup",
        query: {
          network: "test-network"
        }
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.network).toBe("test-network");
        expect(result.data.query.connector).toBeUndefined();
      }
    });

    it("should accept query with both connector and network", () => {
      const result = integrationBaseSchema.safeParse({
        operation: "lookup",
        query: {
          connector: "test-connector",
          network: "test-network"
        }
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.connector).toBe("test-connector");
        expect(result.data.query.network).toBe("test-network");
      }
    });

    it("should require query field", () => {
      const result = integrationBaseSchema.safeParse({
        operation: "lookup"
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["query"]);
        expect(result.error.issues[0].message).toBe("Required");
      }
    });

    it("should reject non-object query values", () => {
      const nonObjectQueries = [123, "string", true, null, []];
      
      for (const query of nonObjectQueries) {
        const result = integrationBaseSchema.safeParse({
          operation: "lookup",
          query
        });
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("invalid_type");
          expect(result.error.issues[0].path).toEqual(["query"]);
        }
      }
    });
  });

  describe("Connector Field Validation", () => {
    it("should accept valid connector string", () => {
      const validConnectors = [
        "connector-name",
        "123456789012345678901234", // 24-char ID
        "GlobalSat LT-100HS/ES",
        "connector with spaces",
        "connector-with-dashes"
      ];
      
      for (const connector of validConnectors) {
        const result = integrationBaseSchema.safeParse({
          operation: "lookup",
          query: { connector }
        });
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.query.connector).toBe(connector);
        }
      }
    });

    it("should accept undefined connector", () => {
      const result = integrationBaseSchema.safeParse({
        operation: "lookup",
        query: {}
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.connector).toBeUndefined();
      }
    });

    it("should reject non-string connector values", () => {
      const nonStringConnectors = [123, true, null, [], {}];
      
      for (const connector of nonStringConnectors) {
        const result = integrationBaseSchema.safeParse({
          operation: "lookup",
          query: { connector }
        });
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("invalid_type");
          expect(result.error.issues[0].path).toEqual(["query", "connector"]);
        }
      }
    });

    it("should accept empty string connector", () => {
      const result = integrationBaseSchema.safeParse({
        operation: "lookup",
        query: { connector: "" }
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.connector).toBe("");
      }
    });
  });

  describe("Network Field Validation", () => {
    it("should accept valid network string", () => {
      const validNetworks = [
        "network-name",
        "123456789012345678901234", // 24-char ID
        "LoRaWAN ChirpStack",
        "network with spaces",
        "network-with-dashes"
      ];
      
      for (const network of validNetworks) {
        const result = integrationBaseSchema.safeParse({
          operation: "lookup",
          query: { network }
        });
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.query.network).toBe(network);
        }
      }
    });

    it("should accept undefined network", () => {
      const result = integrationBaseSchema.safeParse({
        operation: "lookup",
        query: {}
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.network).toBeUndefined();
      }
    });

    it("should reject non-string network values", () => {
      const nonStringNetworks = [123, true, null, [], {}];
      
      for (const network of nonStringNetworks) {
        const result = integrationBaseSchema.safeParse({
          operation: "lookup",
          query: { network }
        });
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("invalid_type");
          expect(result.error.issues[0].path).toEqual(["query", "network"]);
        }
      }
    });

    it("should accept empty string network", () => {
      const result = integrationBaseSchema.safeParse({
        operation: "lookup",
        query: { network: "" }
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.network).toBe("");
      }
    });
  });

  describe("Complete Valid Schemas", () => {
    it("should parse minimal valid schema", () => {
      const minimalSchema = {
        operation: "lookup" as const,
        query: {}
      };
      
      const result = integrationBaseSchema.safeParse(minimalSchema);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(minimalSchema);
      }
    });

    it("should parse complete valid schema with connector", () => {
      const completeSchema = {
        operation: "lookup" as const,
        query: {
          connector: "GlobalSat LT-100HS/ES"
        }
      };
      
      const result = integrationBaseSchema.safeParse(completeSchema);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(completeSchema);
      }
    });

    it("should parse complete valid schema with network", () => {
      const completeSchema = {
        operation: "lookup" as const,
        query: {
          network: "LoRaWAN ChirpStack"
        }
      };
      
      const result = integrationBaseSchema.safeParse(completeSchema);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(completeSchema);
      }
    });

    it("should parse complete valid schema with both connector and network", () => {
      const completeSchema = {
        operation: "lookup" as const,
        query: {
          connector: "123456789012345678901234",
          network: "567890123456789012345678"
        }
      };
      
      const result = integrationBaseSchema.safeParse(completeSchema);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(completeSchema);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle nested invalid types", () => {
      const result = integrationBaseSchema.safeParse({
        operation: "lookup",
        query: {
          connector: {
            nested: "object"
          }
        }
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["query", "connector"]);
      }
    });

    it("should handle very long strings", () => {
      const longString = "a".repeat(1000);
      
      const result = integrationBaseSchema.safeParse({
        operation: "lookup",
        query: {
          connector: longString,
          network: longString
        }
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query.connector).toBe(longString);
        expect(result.data.query.network).toBe(longString);
      }
    });

    it("should handle special characters in strings", () => {
      const specialStrings = [
        "connector/with/slashes",
        "connector@with@symbols",
        "connector with special chars: !@#$%^&*()",
        "connector\nwith\nnewlines",
        "connector\twith\ttabs"
      ];
      
      for (const connector of specialStrings) {
        const result = integrationBaseSchema.safeParse({
          operation: "lookup",
          query: { connector }
        });
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.query.connector).toBe(connector);
        }
      }
    });
  });

  describe("Error Message Quality", () => {
    it("should provide clear error messages for missing operation", () => {
      const result = integrationBaseSchema.safeParse({ query: {} });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        const operationError = result.error.issues.find(issue => 
          issue.path.join(".") === "operation"
        );
        expect(operationError?.message).toBe("Required");
      }
    });

    it("should provide clear error messages for invalid operation", () => {
      const result = integrationBaseSchema.safeParse({ 
        operation: "invalid",
        query: {}
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        const operationError = result.error.issues.find(issue => 
          issue.path.join(".") === "operation"
        );
        expect(operationError?.message).toContain("Invalid enum value");
        expect(operationError?.message).toContain("lookup");
      }
    });

    it("should provide clear error messages for missing query", () => {
      const result = integrationBaseSchema.safeParse({ operation: "lookup" });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        const queryError = result.error.issues.find(issue => 
          issue.path.join(".") === "query"
        );
        expect(queryError?.message).toBe("Required");
      }
    });
  });
}); 