import { describe, it, expect } from "vitest";
import { entityBaseSchema } from "../entity-operations";

describe("entityBaseSchema", () => {
  describe("parse", () => {
    describe("operation field", () => {
      it("should accept valid operation 'lookup'", () => {
        const input = { operation: "lookup" };
        const result = entityBaseSchema.parse(input);
        expect(result.operation).toBe("lookup");
      });

      it("should reject invalid operation", () => {
        const input = { operation: "invalid" };
        expect(() => entityBaseSchema.parse(input)).toThrow();
      });

      it("should require operation field", () => {
        const input = {};
        expect(() => entityBaseSchema.parse(input)).toThrow();
      });
    });

    describe("entityID field", () => {
      it("should accept valid entityID", () => {
        const input = {
          operation: "lookup",
          entityID: "507f1f77bcf86cd799439011",
        };
        const result = entityBaseSchema.parse(input);
        expect(result.entityID).toBe("507f1f77bcf86cd799439011");
      });

      it("should accept missing entityID (optional)", () => {
        const input = { operation: "lookup" };
        const result = entityBaseSchema.parse(input);
        expect(result.entityID).toBeUndefined();
      });

      it("should accept empty string entityID", () => {
        const input = {
          operation: "lookup",
          entityID: "",
        };
        const result = entityBaseSchema.parse(input);
        expect(result.entityID).toBe("");
      });
    });

    describe("lookupEntity field", () => {
      it("should accept valid lookupEntity with all fields", () => {
        const input = {
          operation: "lookup",
          lookupEntity: {
            amount: 50,
            page: 1,
            fields: ["id", "name", "schema"],
            filter: {
              id: "507f1f77bcf86cd799439011",
              name: "sensor",
              tags: [{ key: "entity_type", value: "sensor" }],
            },
          },
        };
        const result = entityBaseSchema.parse(input);
        expect(result.lookupEntity).toBeDefined();
        expect(result.lookupEntity?.amount).toBe(50);
        expect(result.lookupEntity?.page).toBe(1);
        expect(result.lookupEntity?.fields).toEqual(["id", "name", "schema"]);
      });

      it("should accept lookupEntity with minimal fields", () => {
        const input = {
          operation: "lookup",
          lookupEntity: {},
        };
        const result = entityBaseSchema.parse(input);
        expect(result.lookupEntity).toEqual({});
      });

      it("should accept missing lookupEntity (optional)", () => {
        const input = { operation: "lookup" };
        const result = entityBaseSchema.parse(input);
        expect(result.lookupEntity).toBeUndefined();
      });

      describe("amount validation", () => {
        it("should accept valid amount within range", () => {
          const input = {
            operation: "lookup",
            lookupEntity: { amount: 100 },
          };
          const result = entityBaseSchema.parse(input);
          expect(result.lookupEntity?.amount).toBe(100);
        });

        it("should accept minimum amount (1)", () => {
          const input = {
            operation: "lookup",
            lookupEntity: { amount: 1 },
          };
          const result = entityBaseSchema.parse(input);
          expect(result.lookupEntity?.amount).toBe(1);
        });

        it("should accept maximum amount (10000)", () => {
          const input = {
            operation: "lookup",
            lookupEntity: { amount: 10000 },
          };
          const result = entityBaseSchema.parse(input);
          expect(result.lookupEntity?.amount).toBe(10000);
        });

        it("should reject amount below minimum", () => {
          const input = {
            operation: "lookup",
            lookupEntity: { amount: 0 },
          };
          expect(() => entityBaseSchema.parse(input)).toThrow();
        });

        it("should reject amount above maximum", () => {
          const input = {
            operation: "lookup",
            lookupEntity: { amount: 10001 },
          };
          expect(() => entityBaseSchema.parse(input)).toThrow();
        });
      });

      describe("page validation", () => {
        it("should accept valid page number", () => {
          const input = {
            operation: "lookup",
            lookupEntity: { page: 5 },
          };
          const result = entityBaseSchema.parse(input);
          expect(result.lookupEntity?.page).toBe(5);
        });

        it("should accept minimum page (1)", () => {
          const input = {
            operation: "lookup",
            lookupEntity: { page: 1 },
          };
          const result = entityBaseSchema.parse(input);
          expect(result.lookupEntity?.page).toBe(1);
        });

        it("should reject page below minimum", () => {
          const input = {
            operation: "lookup",
            lookupEntity: { page: 0 },
          };
          expect(() => entityBaseSchema.parse(input)).toThrow();
        });
      });

      describe("fields validation", () => {
        it("should accept valid fields array", () => {
          const validFields = ["id", "name", "schema", "index", "tags", "payload_decoder", "created_at", "updated_at"];
          const input = {
            operation: "lookup",
            lookupEntity: { fields: validFields },
          };
          const result = entityBaseSchema.parse(input);
          expect(result.lookupEntity?.fields).toEqual(validFields);
        });

        it("should accept subset of valid fields", () => {
          const input = {
            operation: "lookup",
            lookupEntity: { fields: ["id", "name"] },
          };
          const result = entityBaseSchema.parse(input);
          expect(result.lookupEntity?.fields).toEqual(["id", "name"]);
        });

        it("should not reject invalid field names (fields validation is open)", () => {
          const input = {
            operation: "lookup",
            lookupEntity: { fields: ["invalid_field"] },
          };
          // The current schema allows any string fields, so this won't throw
          const result = entityBaseSchema.parse(input);
          expect(result.lookupEntity?.fields).toEqual(["invalid_field"]);
        });

        it("should accept empty fields array", () => {
          const input = {
            operation: "lookup",
            lookupEntity: { fields: [] },
          };
          const result = entityBaseSchema.parse(input);
          expect(result.lookupEntity?.fields).toEqual([]);
        });
      });

      describe("filter validation", () => {
        describe("id filter", () => {
          it("should accept valid 24-character ID", () => {
            const input = {
              operation: "lookup",
              lookupEntity: {
                filter: { id: "507f1f77bcf86cd799439011" },
              },
            };
            const result = entityBaseSchema.parse(input);
            expect(result.lookupEntity?.filter?.id).toBe("507f1f77bcf86cd799439011");
          });

          it("should reject ID with incorrect length", () => {
            const input = {
              operation: "lookup",
              lookupEntity: {
                filter: { id: "short" },
              },
            };
            expect(() => entityBaseSchema.parse(input)).toThrow();
          });
        });

        describe("name filter", () => {
          it("should accept name filter and transform with wildcards", () => {
            const input = {
              operation: "lookup",
              lookupEntity: {
                filter: { name: "sensor" },
              },
            };
            const result = entityBaseSchema.parse(input);
            expect(result.lookupEntity?.filter?.name).toBe("*sensor*");
          });

          it("should transform empty name with wildcards", () => {
            const input = {
              operation: "lookup",
              lookupEntity: {
                filter: { name: "" },
              },
            };
            const result = entityBaseSchema.parse(input);
            expect(result.lookupEntity?.filter?.name).toBe("**");
          });
        });

        describe("tags filter", () => {
          it("should accept valid tags array", () => {
            const tags = [
              { key: "entity_type", value: "sensor" },
              { key: "location", value: "warehouse" },
            ];
            const input = {
              operation: "lookup",
              lookupEntity: {
                filter: { tags },
              },
            };
            const result = entityBaseSchema.parse(input);
            expect(result.lookupEntity?.filter?.tags).toEqual(tags);
          });

          it("should accept empty tags array", () => {
            const input = {
              operation: "lookup",
              lookupEntity: {
                filter: { tags: [] },
              },
            };
            const result = entityBaseSchema.parse(input);
            expect(result.lookupEntity?.filter?.tags).toEqual([]);
          });

          it("should reject tags with missing key", () => {
            const input = {
              operation: "lookup",
              lookupEntity: {
                filter: { tags: [{ value: "sensor" }] },
              },
            };
            expect(() => entityBaseSchema.parse(input)).toThrow();
          });

          it("should reject tags with missing value", () => {
            const input = {
              operation: "lookup",
              lookupEntity: {
                filter: { tags: [{ key: "entity_type" }] },
              },
            };
            expect(() => entityBaseSchema.parse(input)).toThrow();
          });
        });

        it("should accept filter with multiple properties", () => {
          const input = {
            operation: "lookup",
            lookupEntity: {
              filter: {
                id: "507f1f77bcf86cd799439011",
                name: "temperature",
                tags: [{ key: "type", value: "sensor" }],
              },
            },
          };
          const result = entityBaseSchema.parse(input);
          expect(result.lookupEntity?.filter?.id).toBe("507f1f77bcf86cd799439011");
          expect(result.lookupEntity?.filter?.name).toBe("*temperature*");
          expect(result.lookupEntity?.filter?.tags).toEqual([{ key: "type", value: "sensor" }]);
        });

        it("should accept empty filter object", () => {
          const input = {
            operation: "lookup",
            lookupEntity: {
              filter: {},
            },
          };
          const result = entityBaseSchema.parse(input);
          expect(result.lookupEntity?.filter).toEqual({});
        });
      });
    });

    describe("complete valid schemas", () => {
      it("should parse lookup operation with entityID", () => {
        const input = {
          operation: "lookup",
          entityID: "507f1f77bcf86cd799439011",
        };
        const result = entityBaseSchema.parse(input);
        expect(result).toEqual(input);
      });

      it("should parse lookup operation with lookupEntity", () => {
        const input = {
          operation: "lookup",
          lookupEntity: {
            amount: 100,
            page: 1,
            fields: ["id", "name", "schema"],
            filter: {
              name: "sensor",
              tags: [{ key: "entity_type", value: "temperature" }],
            },
          },
        };
        const result = entityBaseSchema.parse(input);
        expect(result.operation).toBe("lookup");
        expect(result.lookupEntity?.amount).toBe(100);
        expect(result.lookupEntity?.filter?.name).toBe("*sensor*");
      });

      it("should parse minimal valid schema", () => {
        const input = { operation: "lookup" };
        const result = entityBaseSchema.parse(input);
        expect(result).toEqual(input);
      });
    });

    describe("type validation", () => {
      it("should reject non-object input", () => {
        expect(() => entityBaseSchema.parse("string")).toThrow();
        expect(() => entityBaseSchema.parse(123)).toThrow();
        expect(() => entityBaseSchema.parse([])).toThrow();
        expect(() => entityBaseSchema.parse(null)).toThrow();
      });

      it("should reject undefined input", () => {
        expect(() => entityBaseSchema.parse(undefined)).toThrow();
      });
    });
  });
});
