import { describe, it, expect } from "vitest";
import { ZodError } from "zod/v3";
import { deviceBaseSchema } from "../tools/device-lookup";

describe("deviceBaseSchema", () => {

  describe("Operation Validation", () => {
    it("should validate 'lookup' operation", () => {
      const validSchema = {
        operation: "lookup"
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate 'delete' operation", () => {
      const validSchema = {
        operation: "delete"
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate 'create' operation", () => {
      const validSchema = {
        operation: "create"
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate 'update' operation", () => {
      const validSchema = {
        operation: "update"
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should reject invalid operation", () => {
      const invalidSchema = {
        operation: "invalid_operation"
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
    });

    it("should reject missing operation", () => {
      const invalidSchema = {};

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
    });
  });

  describe("DeviceID Validation", () => {
    it("should validate valid 24-character deviceID", () => {
      const validSchema = {
        operation: "lookup",
        deviceID: "507f1f77bcf86cd799439011"
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should allow missing deviceID (optional field)", () => {
      const validSchema = {
        operation: "lookup"
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should accept deviceID with any length (no validation in base schema)", () => {
      const validSchema = {
        operation: "lookup",
        deviceID: "short_id"
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should accept empty deviceID (no validation in base schema)", () => {
      const validSchema = {
        operation: "lookup",
        deviceID: ""
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should reject non-string deviceID", () => {
      const invalidSchema = {
        operation: "lookup",
        deviceID: 12345
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
    });
  });

  describe("LookupDevice Validation", () => {
    it("should validate complete lookupDevice object", () => {
      const validSchema = {
        operation: "lookup",
        lookupDevice: {
          amount: 10,
          page: 1,
          fields: ["id", "name"],
          filter: {
            name: "test_device",
            active: true,
            type: "mutable"
          },
          include_data_amount: true,
          include_configuration_params: false
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate lookupDevice with minimal fields", () => {
      const validSchema = {
        operation: "lookup",
        lookupDevice: {}
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate lookupDevice with filter", () => {
      const validSchema = {
        operation: "lookup",
        lookupDevice: {
          filter: {
            id: "507f1f77bcf86cd799439011",
            connector: "507f1f77bcf86cd799439022",
            network: "507f1f77bcf86cd799439033",
            tags: [
              { key: "device_type", value: "sensor" },
              { key: "location", value: "office" }
            ]
          }
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should reject lookupDevice with invalid filter deviceID", () => {
      const invalidSchema = {
        operation: "lookup",
        lookupDevice: {
          filter: {
            id: "invalid_id"
          }
        }
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
    });

    it("should reject lookupDevice with invalid device type", () => {
      const invalidSchema = {
        operation: "lookup",
        lookupDevice: {
          filter: {
            type: "invalid_type"
          }
        }
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
    });
  });

  describe("CreateDevice Validation", () => {
    it("should validate complete createDevice object", () => {
      const validSchema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "mutable",
          connector: "62333bd36977fc001a2990c8",
          network: "62336c32ab6e0d0012e06c04",
          description: "A test device",
          active: true,
          visible: true,
          tags: [
            { key: "device_type", value: "sensor" }
          ],
          configuration_params: [
            {
              key: "param1",
              value: "value1",
              sent: false
            }
          ]
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate createDevice with minimal required fields", () => {
      const validSchema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "mutable"
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate createDevice with immutable type and chunk settings", () => {
      const validSchema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "immutable",
          chunk_period: "week",
          chunk_retention: 4
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should reject createDevice with invalid type", () => {
      const invalidSchema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "invalid_type"
        }
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
    });

    it("should reject createDevice with invalid chunk_period", () => {
      const invalidSchema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "immutable",
          chunk_period: "invalid_period"
        }
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
    });

    it("should reject createDevice with missing name", () => {
      const invalidSchema = {
        operation: "create",
        createDevice: {
          type: "mutable"
        }
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
    });

    it("should reject createDevice with missing type", () => {
      const invalidSchema = {
        operation: "create",
        createDevice: {
          name: "Test Device"
        }
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
    });
  });

  describe("UpdateDevice Validation", () => {
    it("should validate complete updateDevice object", () => {
      const validSchema = {
        operation: "update",
        updateDevice: {
          name: "Updated Device",
          description: "Updated description",
          active: false,
          visible: true,
          tags: [
            { key: "updated", value: "true" }
          ]
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate updateDevice with single field", () => {
      const validSchema = {
        operation: "update",
        updateDevice: {
          name: "New Name"
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate updateDevice with payload_decoder", () => {
      const validSchema = {
        operation: "update",
        updateDevice: {
          payload_decoder: "function decode(payload) { return payload; }"
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate empty updateDevice object", () => {
      const validSchema = {
        operation: "update",
        updateDevice: {}
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });
  });

  describe("Complex Scenarios", () => {
    it("should validate lookup operation with deviceID and lookupDevice", () => {
      const validSchema = {
        operation: "lookup",
        deviceID: "507f1f77bcf86cd799439011",
        lookupDevice: {
          amount: 5,
          include_data_amount: true
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate create operation with all optional fields", () => {
      const validSchema = {
        operation: "create",
        createDevice: {
          name: "Complex Device",
          type: "immutable",
          connector: "507f1f77bcf86cd799439011",
          network: "507f1f77bcf86cd799439022",
          description: "Complex test device",
          active: true,
          visible: false,
          chunk_period: "month",
          chunk_retention: 12,
          serie_number: "SN123456",
          connector_parse: true,
          payload_decoder: "// Custom decoder code",
          tags: [
            { key: "environment", value: "test" },
            { key: "priority", value: "high" }
          ],
          configuration_params: [
            {
              id: "param_id_1",
              key: "api_endpoint",
              value: "https://api.example.com",
              sent: true
            },
            {
              key: "timeout",
              value: "30",
              sent: false
            }
          ]
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate update operation with deviceID and updateDevice", () => {
      const validSchema = {
        operation: "update",
        deviceID: "507f1f77bcf86cd799439011",
        updateDevice: {
          name: "Updated Name",
          active: false
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate delete operation with deviceID", () => {
      const validSchema = {
        operation: "delete",
        deviceID: "507f1f77bcf86cd799439011"
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("should handle name transformation in lookupDevice filter", () => {
      const validSchema = {
        operation: "lookup",
        lookupDevice: {
          filter: {
            name: "test"
          }
        }
      };

      const result = deviceBaseSchema.parse(validSchema);
      expect(result.lookupDevice?.filter?.name).toBe("*test*");
    });

    it("should validate tags with empty arrays", () => {
      const validSchema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "mutable",
          tags: []
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate configuration_params with empty arrays", () => {
      const validSchema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "mutable",
          configuration_params: []
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate default connector and network values", () => {
      const validSchema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "mutable"
        }
      };

      const result = deviceBaseSchema.parse(validSchema);
      expect(result.createDevice?.connector).toBe("62333bd36977fc001a2990c8");
      expect(result.createDevice?.network).toBe("62336c32ab6e0d0012e06c04");
    });

    it("should validate boolean fields as optional", () => {
      const validSchema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "mutable",
          active: undefined,
          visible: undefined,
          connector_parse: undefined
        }
      };

      expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
    });

    it("should validate all chunk_period enum values", () => {
      const periods = ["day", "week", "month", "quarter"];
      
      for (const period of periods) {
        const validSchema = {
          operation: "create",
          createDevice: {
            name: "Test Device",
            type: "immutable",
            chunk_period: period
          }
        };
        
        expect(() => deviceBaseSchema.parse(validSchema)).not.toThrow();
      }
    });
  });

  describe("Error Handling", () => {
    it("should provide detailed error messages for invalid operations", () => {
      const invalidSchema = {
        operation: "invalid_op"
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
      
      try {
        deviceBaseSchema.parse(invalidSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.issues).toHaveLength(1);
        expect(zodError.issues[0].code).toBe("invalid_enum_value");
      }
    });

    it("should provide detailed error messages for invalid deviceID in filter", () => {
      const invalidSchema = {
        operation: "lookup",
        lookupDevice: {
          filter: {
            id: "short"
          }
        }
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
      
      try {
        deviceBaseSchema.parse(invalidSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.issues[0].message).toContain("Device ID must be 24 characters long");
      }
    });

    it("should provide detailed error messages for invalid tags", () => {
      const invalidSchema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "mutable",
          tags: [
            { key: "valid_key", value: "valid_value" },
            { key: "invalid_tag" } // missing value
          ]
        }
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
      
      try {
        deviceBaseSchema.parse(invalidSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.issues[0].message).toContain("Required");
      }
    });

    it("should provide detailed error messages for invalid configuration_params", () => {
      const invalidSchema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "mutable",
          configuration_params: [
            {
              key: "test_key",
              value: "test_value"
              // missing sent field
            }
          ]
        }
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
      
      try {
        deviceBaseSchema.parse(invalidSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.issues[0].message).toContain("Required");
      }
    });

    it("should handle multiple validation errors", () => {
      const invalidSchema = {
        operation: "create",
        deviceID: "short_id",
        createDevice: {
          name: "", // empty name
          type: "invalid_type", // invalid type
          tags: [
            { key: "incomplete_tag" } // missing value
          ]
        }
      };

      expect(() => deviceBaseSchema.parse(invalidSchema)).toThrow(ZodError);
      
      try {
        deviceBaseSchema.parse(invalidSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.issues.length).toBeGreaterThan(1);
      }
    });
  });

  describe("Type Transformations", () => {
    it("should transform name filter to include wildcards", () => {
      const schema = {
        operation: "lookup",
        lookupDevice: {
          filter: {
            name: "sensor"
          }
        }
      };

      const result = deviceBaseSchema.parse(schema);
      expect(result.lookupDevice?.filter?.name).toBe("*sensor*");
    });

    it("should preserve exact name when already wrapped", () => {
      const schema = {
        operation: "lookup",
        lookupDevice: {
          filter: {
            name: "*sensor*"
          }
        }
      };

      const result = deviceBaseSchema.parse(schema);
      expect(result.lookupDevice?.filter?.name).toBe("**sensor**");
    });

    it("should handle empty name filter", () => {
      const schema = {
        operation: "lookup",
        lookupDevice: {
          filter: {
            name: ""
          }
        }
      };

      const result = deviceBaseSchema.parse(schema);
      expect(result.lookupDevice?.filter?.name).toBe("**");
    });
  });

  describe("Schema Descriptions", () => {
    it("should have proper descriptions for all fields", () => {
      const schema = deviceBaseSchema._def;
      
      expect(schema.description).toBe("Schema for the device operation. The delete operation only requires the deviceID.");
      
      // Check that main fields have descriptions
      const shape = schema.shape();
      expect(shape.operation._def.description).toContain("The type of operation to perform on the device");
      expect(shape.deviceID._def.description).toContain("The ID of the Device to perform the operation on");
      expect(shape.lookupDevice._def.description).toBe("The device to be listed. Required for lookup operations.");
      expect(shape.createDevice._def.description).toBe("The device to be created. Required for create operations.");
      expect(shape.updateDevice._def.description).toBe("The device to be updated. Required for update operations.");
    });
  });
}); 