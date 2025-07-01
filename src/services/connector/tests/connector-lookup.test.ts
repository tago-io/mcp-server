import { describe, it, expect } from "vitest";
import { connectorBaseSchema } from "../tools/connector-lookup";

describe("connectorBaseSchema Parse", () => {
  describe("Operation Validation", () => {
    it("should accept valid operation types", () => {
      const validOperations = ["lookup"];
      
      for (const operation of validOperations) {
        const result = connectorBaseSchema.safeParse({ operation });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.operation).toBe(operation);
        }
      }
    });

    it("should reject invalid operation types", () => {
      const invalidOperations = ["create", "update", "delete", "invalid", "get", "patch", "remove", ""];
      
      for (const operation of invalidOperations) {
        const result = connectorBaseSchema.safeParse({ operation });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("invalid_enum_value");
          expect(result.error.issues[0].path).toEqual(["operation"]);
        }
      }
    });

    it("should require operation field", () => {
      const result = connectorBaseSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["operation"]);
        expect(result.error.issues[0].message).toBe("Required");
      }
    });
  });

  describe("ConnectorID Validation", () => {
    it("should accept valid connectorID", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        connectorID: "123456789012345678901234",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.connectorID).toBe("123456789012345678901234");
      }
    });

    it("should accept undefined connectorID", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.connectorID).toBeUndefined();
      }
    });

    it("should reject non-string connectorID", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        connectorID: 123,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["connectorID"]);
      }
    });

    it("should reject null connectorID", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        connectorID: null,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["connectorID"]);
      }
    });
  });

  describe("LookupConnector Validation", () => {
    it("should accept valid lookupConnector with all fields", () => {
      const validLookupConnector = {
        amount: 50,
        page: 1,
        fields: ["id", "name", "description"],
        filter: {
          id: "123456789012345678901234",
          name: "test connector",
        },
      };

      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: validLookupConnector,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupConnector).toEqual({
          ...validLookupConnector,
          filter: {
            ...validLookupConnector.filter,
            name: "*test connector*", // name gets transformed with wildcards
          },
        });
      }
    });

    it("should accept lookupConnector with minimal fields", () => {
      const minimalLookupConnector = {
        amount: 10,
      };

      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: minimalLookupConnector,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupConnector).toEqual(minimalLookupConnector);
      }
    });

    it("should accept lookupConnector with valid fields array", () => {
      const validFields = ["id", "name", "description", "networks", "created_at", "updated_at"];
      
      for (const field of validFields) {
        const result = connectorBaseSchema.safeParse({
          operation: "lookup",
          lookupConnector: {
            fields: [field],
          },
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.lookupConnector?.fields).toContain(field);
        }
      }
    });

    it("should reject lookupConnector with invalid fields", () => {
      const invalidFields = ["invalid_field", "non_existent", "", "tags", "device_parameters"];
      
      for (const field of invalidFields) {
        const result = connectorBaseSchema.safeParse({
          operation: "lookup",
          lookupConnector: {
            fields: [field],
          },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("invalid_enum_value");
          expect(result.error.issues[0].path).toEqual(["lookupConnector", "fields", 0]);
        }
      }
    });

    it("should reject lookupConnector with amount exceeding limits", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: {
          amount: 10001, // exceeds max limit
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("too_big");
        expect(result.error.issues[0].path).toEqual(["lookupConnector", "amount"]);
      }
    });

    it("should reject lookupConnector with amount below minimum", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: {
          amount: 0, // below minimum
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("too_small");
        expect(result.error.issues[0].path).toEqual(["lookupConnector", "amount"]);
      }
    });

    it("should reject lookupConnector with page below minimum", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: {
          page: 0, // below minimum
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("too_small");
        expect(result.error.issues[0].path).toEqual(["lookupConnector", "page"]);
      }
    });

    it("should accept lookupConnector with valid filter ID", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: {
          filter: {
            id: "123456789012345678901234", // exactly 24 characters
          },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupConnector?.filter?.id).toBe("123456789012345678901234");
      }
    });

    it("should reject lookupConnector with invalid filter ID length", () => {
      const invalidIds = ["123", "12345678901234567890123456789"]; // too short and too long
      
      for (const id of invalidIds) {
        const result = connectorBaseSchema.safeParse({
          operation: "lookup",
          lookupConnector: {
            filter: { id },
          },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(["too_small", "too_big"]).toContain(result.error.issues[0].code);
          expect(result.error.issues[0].path).toEqual(["lookupConnector", "filter", "id"]);
        }
      }
    });

    it("should apply name transformation with wildcards", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: {
          filter: {
            name: "http",
          },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupConnector?.filter?.name).toBe("*http*");
      }
    });

    it("should filter out unsupported filter fields gracefully", () => {
      // The connector schema only keeps id and name filter fields, filtering out others
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: { 
          filter: {
            id: "123456789012345678901234",
            name: "test",
            active: true, // this will be filtered out
            type: "http", // this will be filtered out
          }
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupConnector?.filter).toEqual({
          id: "123456789012345678901234",
          name: "*test*", // transformed with wildcards
        });
      }
    });

    it("should accept empty filter object", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: { filter: {} },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupConnector?.filter).toEqual({});
      }
    });

    it("should reject lookupConnector with malformed filter structure", () => {
      // Test actual invalid filter structures
      const invalidFilters = [
        "invalid_string",
        123,
        [],
        null,
      ];

      for (const filter of invalidFilters) {
        const result = connectorBaseSchema.safeParse({
          operation: "lookup",
          lookupConnector: { filter },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("invalid_type");
        }
      }
    });
  });

  describe("Optional Fields", () => {
    it("should accept schema with only required operation field", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe("lookup");
        expect(result.data.connectorID).toBeUndefined();
        expect(result.data.lookupConnector).toBeUndefined();
      }
    });

    it("should accept schema with connectorID only", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        connectorID: "123456789012345678901234",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe("lookup");
        expect(result.data.connectorID).toBe("123456789012345678901234");
        expect(result.data.lookupConnector).toBeUndefined();
      }
    });

    it("should accept schema with lookupConnector only", () => {
      const lookupConnector = {
        amount: 100,
        fields: ["id", "name"],
      };

      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe("lookup");
        expect(result.data.connectorID).toBeUndefined();
        expect(result.data.lookupConnector).toEqual(lookupConnector);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should reject empty object", () => {
      const result = connectorBaseSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject null input", () => {
      const result = connectorBaseSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it("should reject undefined input", () => {
      const result = connectorBaseSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it("should reject string input", () => {
      const result = connectorBaseSchema.safeParse("invalid");
      expect(result.success).toBe(false);
    });

    it("should reject array input", () => {
      const result = connectorBaseSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    it("should handle extra unknown fields gracefully", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        unknownField: "should be ignored",
        connectorID: "123456789012345678901234",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe("lookup");
        expect(result.data.connectorID).toBe("123456789012345678901234");
        expect("unknownField" in result.data).toBe(false);
      }
    });
  });

  describe("Complex Scenarios", () => {
    it("should accept complete valid schema with all optional fields", () => {
      const completeSchema = {
        operation: "lookup",
        connectorID: "123456789012345678901234",
        lookupConnector: {
          amount: 100,
          page: 2,
          fields: ["id", "name", "description", "networks", "created_at", "updated_at"],
          filter: {
            id: "123456789012345678901234",
            name: "http connector",
          },
        },
      };

      const result = connectorBaseSchema.safeParse(completeSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          ...completeSchema,
          lookupConnector: {
            ...completeSchema.lookupConnector,
            filter: {
              ...completeSchema.lookupConnector.filter,
              name: "*http connector*", // transformed with wildcards
            },
          },
        });
      }
    });

    it("should validate nested filter object completely", () => {
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: {
          filter: {
            id: "123456789012345678901234",
            name: "mqtt connector",
          },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const filter = result.data.lookupConnector?.filter;
        expect(filter?.id).toBe("123456789012345678901234");
        expect(filter?.name).toBe("*mqtt connector*");
      }
    });

    it("should validate connector-specific field combinations", () => {
      // Test that connector supports networks field but not device_parameters
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: {
          fields: ["id", "name", "networks", "description"],
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupConnector?.fields).toContain("networks");
        expect(result.data.lookupConnector?.fields).toContain("description");
      }
    });

    it("should validate different connector name patterns", () => {
      const connectorNames = ["HTTP", "MQTT", "LoRaWAN", "Sigfox", "The Things Network"];
      
      for (const name of connectorNames) {
        const result = connectorBaseSchema.safeParse({
          operation: "lookup",
          lookupConnector: {
            filter: { name },
          },
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.lookupConnector?.filter?.name).toBe(`*${name}*`);
        }
      }
    });
  });

  describe("Connector-Specific Behavior", () => {
    it("should validate connector-specific fields enum", () => {
      // Connector has 'networks' field which network schema doesn't have
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: {
          fields: ["networks"],
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupConnector?.fields).toEqual(["networks"]);
      }
    });

    it("should reject network-specific fields that don't exist in connector", () => {
      // Fields like 'device_parameters' exist in network but not in connector
      const result = connectorBaseSchema.safeParse({
        operation: "lookup",
        lookupConnector: {
          fields: ["device_parameters", "public"],
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_enum_value");
      }
    });

    it("should validate typical connector lookup scenarios", () => {
      // Scenario: Find HTTP connectors
      const httpLookup = {
        operation: "lookup",
        lookupConnector: {
          amount: 25,
          filter: { name: "HTTP" },
          fields: ["id", "name", "description", "networks"],
        },
      };

      const result = connectorBaseSchema.safeParse(httpLookup);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupConnector?.filter?.name).toBe("*HTTP*");
      }
    });
  });
}); 