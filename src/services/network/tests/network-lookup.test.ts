import { describe, it, expect } from "vitest";
import { networkBaseSchema } from "../tools/network-lookup";

describe("networkBaseSchema Parse", () => {
  describe("Operation Validation", () => {
    it("should accept valid operation types", () => {
      const validOperations = ["lookup"];
      
      for (const operation of validOperations) {
        const result = networkBaseSchema.safeParse({ operation });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.operation).toBe(operation);
        }
      }
    });

    it("should reject invalid operation types", () => {
      const invalidOperations = ["create", "update", "delete", "invalid", "get", "patch", "remove", ""];
      
      for (const operation of invalidOperations) {
        const result = networkBaseSchema.safeParse({ operation });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("invalid_enum_value");
          expect(result.error.issues[0].path).toEqual(["operation"]);
        }
      }
    });

    it("should require operation field", () => {
      const result = networkBaseSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["operation"]);
        expect(result.error.issues[0].message).toBe("Required");
      }
    });
  });

  describe("NetworkID Validation", () => {
    it("should accept valid networkID", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        networkID: "123456789012345678901234",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.networkID).toBe("123456789012345678901234");
      }
    });

    it("should accept undefined networkID", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.networkID).toBeUndefined();
      }
    });

    it("should reject non-string networkID", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        networkID: 123,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["networkID"]);
      }
    });

    it("should accept null networkID", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        networkID: null,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["networkID"]);
      }
    });
  });

  describe("LookupNetwork Validation", () => {
    it("should accept valid lookupNetwork with all fields", () => {
      const validLookupNetwork = {
        amount: 50,
        page: 1,
        fields: ["id", "name", "description"],
        filter: {
          id: "123456789012345678901234",
          name: "test network",
        },
      };

      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        lookupNetwork: validLookupNetwork,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupNetwork).toEqual({
          ...validLookupNetwork,
          filter: {
            ...validLookupNetwork.filter,
            name: "*test network*", // name gets transformed with wildcards
          },
        });
      }
    });

    it("should accept lookupNetwork with minimal fields", () => {
      const minimalLookupNetwork = {
        amount: 10,
      };

      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        lookupNetwork: minimalLookupNetwork,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupNetwork).toEqual(minimalLookupNetwork);
      }
    });

    it("should accept lookupNetwork with valid fields array", () => {
      const validFields = ["id", "name", "description", "device_parameters", "public", "created_at", "updated_at"];
      
      for (const field of validFields) {
        const result = networkBaseSchema.safeParse({
          operation: "lookup",
          lookupNetwork: {
            fields: [field],
          },
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.lookupNetwork?.fields).toContain(field);
        }
      }
    });

    it("should reject lookupNetwork with invalid fields", () => {
      const invalidFields = ["invalid_field", "non_existent", ""];
      
      for (const field of invalidFields) {
        const result = networkBaseSchema.safeParse({
          operation: "lookup",
          lookupNetwork: {
            fields: [field],
          },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("invalid_enum_value");
          expect(result.error.issues[0].path).toEqual(["lookupNetwork", "fields", 0]);
        }
      }
    });

    it("should reject lookupNetwork with amount exceeding limits", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        lookupNetwork: {
          amount: 10001, // exceeds max limit
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("too_big");
        expect(result.error.issues[0].path).toEqual(["lookupNetwork", "amount"]);
      }
    });

    it("should reject lookupNetwork with amount below minimum", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        lookupNetwork: {
          amount: 0, // below minimum
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("too_small");
        expect(result.error.issues[0].path).toEqual(["lookupNetwork", "amount"]);
      }
    });

    it("should reject lookupNetwork with page below minimum", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        lookupNetwork: {
          page: 0, // below minimum
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("too_small");
        expect(result.error.issues[0].path).toEqual(["lookupNetwork", "page"]);
      }
    });

    it("should accept lookupNetwork with valid filter ID", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        lookupNetwork: {
          filter: {
            id: "123456789012345678901234", // exactly 24 characters
          },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupNetwork?.filter?.id).toBe("123456789012345678901234");
      }
    });

    it("should reject lookupNetwork with invalid filter ID length", () => {
      const invalidIds = ["123", "12345678901234567890123456789"]; // too short and too long
      
      for (const id of invalidIds) {
        const result = networkBaseSchema.safeParse({
          operation: "lookup",
          lookupNetwork: {
            filter: { id },
          },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(["too_small", "too_big"]).toContain(result.error.issues[0].code);
          expect(result.error.issues[0].path).toEqual(["lookupNetwork", "filter", "id"]);
        }
      }
    });

    it("should apply name transformation with wildcards", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        lookupNetwork: {
          filter: {
            name: "sensor",
          },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lookupNetwork?.filter?.name).toBe("*sensor*");
      }
    });
  });

  describe("Optional Fields", () => {
    it("should accept schema with only required operation field", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe("lookup");
        expect(result.data.networkID).toBeUndefined();
        expect(result.data.lookupNetwork).toBeUndefined();
      }
    });

    it("should accept schema with networkID only", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        networkID: "123456789012345678901234",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe("lookup");
        expect(result.data.networkID).toBe("123456789012345678901234");
        expect(result.data.lookupNetwork).toBeUndefined();
      }
    });

    it("should accept schema with lookupNetwork only", () => {
      const lookupNetwork = {
        amount: 100,
        fields: ["id", "name"],
      };

      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        lookupNetwork,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe("lookup");
        expect(result.data.networkID).toBeUndefined();
        expect(result.data.lookupNetwork).toEqual(lookupNetwork);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should reject empty object", () => {
      const result = networkBaseSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject null input", () => {
      const result = networkBaseSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it("should reject undefined input", () => {
      const result = networkBaseSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it("should reject string input", () => {
      const result = networkBaseSchema.safeParse("invalid");
      expect(result.success).toBe(false);
    });

    it("should reject array input", () => {
      const result = networkBaseSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    it("should handle extra unknown fields gracefully", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        unknownField: "should be ignored",
        networkID: "123456789012345678901234",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe("lookup");
        expect(result.data.networkID).toBe("123456789012345678901234");
        expect("unknownField" in result.data).toBe(false);
      }
    });
  });

  describe("Complex Scenarios", () => {
    it("should accept complete valid schema with all optional fields", () => {
      const completeSchema = {
        operation: "lookup",
        networkID: "123456789012345678901234",
        lookupNetwork: {
          amount: 100,
          page: 2,
          fields: ["id", "name", "description", "device_parameters", "public", "created_at", "updated_at"],
          filter: {
            id: "123456789012345678901234",
            name: "test network",
          },
        },
      };

      const result = networkBaseSchema.safeParse(completeSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          ...completeSchema,
          lookupNetwork: {
            ...completeSchema.lookupNetwork,
            filter: {
              ...completeSchema.lookupNetwork.filter,
              name: "*test network*", // transformed with wildcards
            },
          },
        });
      }
    });

    it("should validate nested filter object completely", () => {
      const result = networkBaseSchema.safeParse({
        operation: "lookup",
        lookupNetwork: {
          filter: {
            id: "123456789012345678901234",
            name: "sensor network",
          },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const filter = result.data.lookupNetwork?.filter;
        expect(filter?.id).toBe("123456789012345678901234");
        expect(filter?.name).toBe("*sensor network*");
      }
    });
  });
}); 