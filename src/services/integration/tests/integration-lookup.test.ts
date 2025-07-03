import { describe, it, expect } from "vitest";
import { integrationBaseSchema } from "../tools/integration-lookup";

describe("integrationBaseSchema", () => {
  describe("parse", () => {
    describe("operation field", () => {
      it("should accept valid operation 'lookup'", () => {
        const input = { 
          operation: "lookup",
          integrationType: "network"
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.operation).toBe("lookup");
      });

      it("should reject invalid operation", () => {
        const input = { 
          operation: "invalid",
          integrationType: "network"
        };
        expect(() => integrationBaseSchema.parse(input)).toThrow();
      });

      it("should require operation field", () => {
        const input = { integrationType: "network" };
        expect(() => integrationBaseSchema.parse(input)).toThrow();
      });
    });

    describe("integrationType field", () => {
      it("should accept valid integrationType 'network'", () => {
        const input = { 
          operation: "lookup",
          integrationType: "network"
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.integrationType).toBe("network");
      });

      it("should accept valid integrationType 'connector'", () => {
        const input = { 
          operation: "lookup",
          integrationType: "connector"
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.integrationType).toBe("connector");
      });

      it("should reject invalid integrationType", () => {
        const input = { 
          operation: "lookup",
          integrationType: "invalid"
        };
        expect(() => integrationBaseSchema.parse(input)).toThrow();
      });

      it("should require integrationType field", () => {
        const input = { operation: "lookup" };
        expect(() => integrationBaseSchema.parse(input)).toThrow();
      });
    });

    describe("networkID field", () => {
      it("should accept valid networkID", () => {
        const input = {
          operation: "lookup",
          integrationType: "network",
          networkID: "507f1f77bcf86cd799439011"
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.networkID).toBe("507f1f77bcf86cd799439011");
      });

      it("should accept missing networkID (optional)", () => {
        const input = { 
          operation: "lookup",
          integrationType: "network"
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.networkID).toBeUndefined();
      });

      it("should accept empty string networkID", () => {
        const input = {
          operation: "lookup",
          integrationType: "network",
          networkID: ""
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.networkID).toBe("");
      });
    });

    describe("connectorID field", () => {
      it("should accept valid connectorID", () => {
        const input = {
          operation: "lookup",
          integrationType: "connector",
          connectorID: "507f1f77bcf86cd799439011"
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.connectorID).toBe("507f1f77bcf86cd799439011");
      });

      it("should accept missing connectorID (optional)", () => {
        const input = { 
          operation: "lookup",
          integrationType: "connector"
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.connectorID).toBeUndefined();
      });

      it("should accept empty string connectorID", () => {
        const input = {
          operation: "lookup",
          integrationType: "connector",
          connectorID: ""
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.connectorID).toBe("");
      });
    });

    describe("lookupNetwork field", () => {
      it("should accept valid lookupNetwork with all fields", () => {
        const input = {
          operation: "lookup",
          integrationType: "network",
          lookupNetwork: {
            amount: 50,
            page: 1,
            fields: ["id", "name", "description"],
            filter: {
              id: "507f1f77bcf86cd799439011",
              name: "sensor"
            }
          }
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.lookupNetwork).toBeDefined();
        expect(result.lookupNetwork?.amount).toBe(50);
        expect(result.lookupNetwork?.page).toBe(1);
        expect(result.lookupNetwork?.fields).toEqual(["id", "name", "description"]);
      });

      it("should accept lookupNetwork with minimal fields", () => {
        const input = {
          operation: "lookup",
          integrationType: "network",
          lookupNetwork: {}
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.lookupNetwork).toEqual({});
      });

      it("should accept missing lookupNetwork (optional)", () => {
        const input = { 
          operation: "lookup",
          integrationType: "network"
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.lookupNetwork).toBeUndefined();
      });

      describe("amount validation", () => {
        it("should accept valid amount within range", () => {
          const input = {
            operation: "lookup",
            integrationType: "network",
            lookupNetwork: { amount: 100 }
          };
          const result = integrationBaseSchema.parse(input);
          expect(result.lookupNetwork?.amount).toBe(100);
        });

        it("should accept minimum amount (1)", () => {
          const input = {
            operation: "lookup",
            integrationType: "network",
            lookupNetwork: { amount: 1 }
          };
          const result = integrationBaseSchema.parse(input);
          expect(result.lookupNetwork?.amount).toBe(1);
        });

        it("should accept maximum amount (10000)", () => {
          const input = {
            operation: "lookup",
            integrationType: "network",
            lookupNetwork: { amount: 10000 }
          };
          const result = integrationBaseSchema.parse(input);
          expect(result.lookupNetwork?.amount).toBe(10000);
        });

        it("should reject amount below minimum", () => {
          const input = {
            operation: "lookup",
            integrationType: "network",
            lookupNetwork: { amount: 0 }
          };
          expect(() => integrationBaseSchema.parse(input)).toThrow();
        });

        it("should reject amount above maximum", () => {
          const input = {
            operation: "lookup",
            integrationType: "network",
            lookupNetwork: { amount: 10001 }
          };
          expect(() => integrationBaseSchema.parse(input)).toThrow();
        });
      });

      describe("page validation", () => {
        it("should accept valid page number", () => {
          const input = {
            operation: "lookup",
            integrationType: "network",
            lookupNetwork: { page: 5 }
          };
          const result = integrationBaseSchema.parse(input);
          expect(result.lookupNetwork?.page).toBe(5);
        });

        it("should accept minimum page (1)", () => {
          const input = {
            operation: "lookup",
            integrationType: "network",
            lookupNetwork: { page: 1 }
          };
          const result = integrationBaseSchema.parse(input);
          expect(result.lookupNetwork?.page).toBe(1);
        });

        it("should reject page below minimum", () => {
          const input = {
            operation: "lookup",
            integrationType: "network",
            lookupNetwork: { page: 0 }
          };
          expect(() => integrationBaseSchema.parse(input)).toThrow();
        });
      });

      describe("fields validation", () => {
        it("should accept valid fields array", () => {
          const validFields = ["id", "name", "description", "device_parameters", "public", "created_at", "updated_at"];
          const input = {
            operation: "lookup",
            integrationType: "network",
            lookupNetwork: { fields: validFields }
          };
          const result = integrationBaseSchema.parse(input);
          expect(result.lookupNetwork?.fields).toEqual(validFields);
        });

        it("should accept subset of valid fields", () => {
          const input = {
            operation: "lookup",
            integrationType: "network",
            lookupNetwork: { fields: ["id", "name"] }
          };
          const result = integrationBaseSchema.parse(input);
          expect(result.lookupNetwork?.fields).toEqual(["id", "name"]);
        });

        it("should reject invalid field names", () => {
          const input = {
            operation: "lookup",
            integrationType: "network",
            lookupNetwork: { fields: ["invalid_field"] }
          };
          expect(() => integrationBaseSchema.parse(input)).toThrow();
        });

        it("should accept empty fields array", () => {
          const input = {
            operation: "lookup",
            integrationType: "network",
            lookupNetwork: { fields: [] }
          };
          const result = integrationBaseSchema.parse(input);
          expect(result.lookupNetwork?.fields).toEqual([]);
        });
      });

      describe("filter validation", () => {
        describe("id filter", () => {
          it("should accept valid 24-character ID", () => {
            const input = {
              operation: "lookup",
              integrationType: "network",
              lookupNetwork: {
                filter: { id: "507f1f77bcf86cd799439011" }
              }
            };
            const result = integrationBaseSchema.parse(input);
            expect(result.lookupNetwork?.filter?.id).toBe("507f1f77bcf86cd799439011");
          });

          it("should reject ID with wrong length", () => {
            const input = {
              operation: "lookup",
              integrationType: "network",
              lookupNetwork: {
                filter: { id: "123" }
              }
            };
            expect(() => integrationBaseSchema.parse(input)).toThrow();
          });
        });

        describe("name filter", () => {
          it("should accept valid name and add wildcards", () => {
            const input = {
              operation: "lookup",
              integrationType: "network",
              lookupNetwork: {
                filter: { name: "sensor" }
              }
            };
            const result = integrationBaseSchema.parse(input);
            expect(result.lookupNetwork?.filter?.name).toBe("*sensor*");
          });

          it("should add wildcards to empty name", () => {
            const input = {
              operation: "lookup",
              integrationType: "network",
              lookupNetwork: {
                filter: { name: "" }
              }
            };
            const result = integrationBaseSchema.parse(input);
            expect(result.lookupNetwork?.filter?.name).toBe("**");
          });
        });
      });
    });

    describe("lookupConnector field", () => {
      it("should accept valid lookupConnector with all fields", () => {
        const input = {
          operation: "lookup",
          integrationType: "connector",
          lookupConnector: {
            amount: 50,
            page: 1,
            fields: ["id", "name", "description", "networks"],
            filter: {
              id: "507f1f77bcf86cd799439011",
              name: "sensor"
            }
          }
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.lookupConnector).toBeDefined();
        expect(result.lookupConnector?.amount).toBe(50);
        expect(result.lookupConnector?.page).toBe(1);
        expect(result.lookupConnector?.fields).toEqual(["id", "name", "description", "networks"]);
      });

      it("should accept lookupConnector with minimal fields", () => {
        const input = {
          operation: "lookup",
          integrationType: "connector",
          lookupConnector: {}
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.lookupConnector).toEqual({});
      });

      it("should accept missing lookupConnector (optional)", () => {
        const input = { 
          operation: "lookup",
          integrationType: "connector"
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.lookupConnector).toBeUndefined();
      });

      describe("fields validation", () => {
        it("should accept valid connector fields array", () => {
          const validFields = ["id", "name", "description", "networks"];
          const input = {
            operation: "lookup",
            integrationType: "connector",
            lookupConnector: { fields: validFields }
          };
          const result = integrationBaseSchema.parse(input);
          expect(result.lookupConnector?.fields).toEqual(validFields);
        });

        it("should reject invalid connector field names", () => {
          const input = {
            operation: "lookup",
            integrationType: "connector",
            lookupConnector: { fields: ["invalid_field"] }
          };
          expect(() => integrationBaseSchema.parse(input)).toThrow();
        });
      });

      describe("filter validation", () => {
        it("should add wildcards to connector name filter", () => {
          const input = {
            operation: "lookup",
            integrationType: "connector",
            lookupConnector: {
              filter: { name: "temperature" }
            }
          };
          const result = integrationBaseSchema.parse(input);
          expect(result.lookupConnector?.filter?.name).toBe("*temperature*");
        });
      });
    });

    describe("complete valid schemas", () => {
      it("should parse network lookup operation with networkID", () => {
        const input = {
          operation: "lookup",
          integrationType: "network",
          networkID: "507f1f77bcf86cd799439011"
        };
        const result = integrationBaseSchema.parse(input);
        expect(result).toEqual(input);
      });

      it("should parse connector lookup operation with connectorID", () => {
        const input = {
          operation: "lookup",
          integrationType: "connector",
          connectorID: "507f1f77bcf86cd799439011"
        };
        const result = integrationBaseSchema.parse(input);
        expect(result).toEqual(input);
      });

      it("should parse network lookup operation with lookupNetwork", () => {
        const input = {
          operation: "lookup",
          integrationType: "network",
          lookupNetwork: {
            amount: 100,
            page: 1,
            fields: ["id", "name", "description"],
            filter: {
              name: "sensor"
            }
          }
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.operation).toBe("lookup");
        expect(result.integrationType).toBe("network");
        expect(result.lookupNetwork?.amount).toBe(100);
        expect(result.lookupNetwork?.filter?.name).toBe("*sensor*");
      });

      it("should parse connector lookup operation with lookupConnector", () => {
        const input = {
          operation: "lookup",
          integrationType: "connector",
          lookupConnector: {
            amount: 50,
            fields: ["id", "name", "networks"],
            filter: {
              id: "507f1f77bcf86cd799439011"
            }
          }
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.operation).toBe("lookup");
        expect(result.integrationType).toBe("connector");
        expect(result.lookupConnector?.amount).toBe(50);
        expect(result.lookupConnector?.filter?.id).toBe("507f1f77bcf86cd799439011");
      });

      it("should parse minimal valid schema", () => {
        const input = { 
          operation: "lookup",
          integrationType: "network"
        };
        const result = integrationBaseSchema.parse(input);
        expect(result).toEqual(input);
      });
    });

    describe("mixed integrationType scenarios", () => {
      it("should accept network integrationType with connector fields", () => {
        const input = {
          operation: "lookup",
          integrationType: "network",
          connectorID: "507f1f77bcf86cd799439011",
          lookupConnector: {}
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.integrationType).toBe("network");
        expect(result.connectorID).toBe("507f1f77bcf86cd799439011");
        expect(result.lookupConnector).toEqual({});
      });

      it("should accept connector integrationType with network fields", () => {
        const input = {
          operation: "lookup",
          integrationType: "connector",
          networkID: "507f1f77bcf86cd799439011",
          lookupNetwork: {}
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.integrationType).toBe("connector");
        expect(result.networkID).toBe("507f1f77bcf86cd799439011");
        expect(result.lookupNetwork).toEqual({});
      });
    });

    describe("type validation", () => {
      it("should reject non-object input", () => {
        expect(() => integrationBaseSchema.parse("string")).toThrow();
        expect(() => integrationBaseSchema.parse(123)).toThrow();
        expect(() => integrationBaseSchema.parse([])).toThrow();
        expect(() => integrationBaseSchema.parse(null)).toThrow();
      });

      it("should reject undefined input", () => {
        expect(() => integrationBaseSchema.parse(undefined)).toThrow();
      });

      it("should reject empty object", () => {
        expect(() => integrationBaseSchema.parse({})).toThrow();
      });
    });

    describe("edge cases", () => {
      it("should handle special characters in name filters", () => {
        const input = {
          operation: "lookup",
          integrationType: "network",
          lookupNetwork: {
            filter: { name: "test-sensor_123" }
          }
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.lookupNetwork?.filter?.name).toBe("*test-sensor_123*");
      });

      it("should handle unicode characters in name filters", () => {
        const input = {
          operation: "lookup",
          integrationType: "connector",
          lookupConnector: {
            filter: { name: "température" }
          }
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.lookupConnector?.filter?.name).toBe("*température*");
      });

      it("should handle large amounts at boundary", () => {
        const input = {
          operation: "lookup",
          integrationType: "network",
          lookupNetwork: {
            amount: 9999
          }
        };
        const result = integrationBaseSchema.parse(input);
        expect(result.lookupNetwork?.amount).toBe(9999);
      });
    });
  });
}); 