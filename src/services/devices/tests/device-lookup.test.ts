import { describe, it, expect } from "vitest";
import { deviceBaseSchema, deviceSchema } from "../tools/device-lookup";

describe("deviceBaseSchema Parse", () => {
  describe("Operation Validation", () => {
    it("should accept valid operation types", () => {
      const validOperations = [
        "lookup",
        "delete",
        "create",
        "update",
        "parameter-list",
        "parameter-set",
        "parameter-remove",
        "token-list",
        "token-create",
        "token-delete"
      ];
      
      for (const operation of validOperations) {
        const result = deviceBaseSchema.safeParse({ operation });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.operation).toBe(operation);
        }
      }
    });

    it("should reject invalid operation types", () => {
      const invalidOperations = ["invalid", "get", "patch", "remove", "list", ""];
      
      for (const operation of invalidOperations) {
        const result = deviceBaseSchema.safeParse({ operation });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].code).toBe("invalid_enum_value");
          expect(result.error.issues[0].path).toEqual(["operation"]);
        }
      }
    });

    it("should require operation field", () => {
      const result = deviceBaseSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["operation"]);
        expect(result.error.issues[0].message).toBe("Required");
      }
    });
  });

  describe("DeviceID Validation", () => {
    it("should accept valid deviceID", () => {
      const result = deviceBaseSchema.safeParse({
        operation: "delete",
        deviceID: "123456789012345678901234",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deviceID).toBe("123456789012345678901234");
      }
    });

    it("should accept undefined deviceID", () => {
      const result = deviceBaseSchema.safeParse({
        operation: "lookup",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deviceID).toBeUndefined();
      }
    });

    it("should reject non-string deviceID", () => {
      const result = deviceBaseSchema.safeParse({
        operation: "delete",
        deviceID: 123,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["deviceID"]);
      }
    });
  });

  describe("CreateDevice Validation", () => {
    it("should accept valid createDevice with required fields", () => {
      const validCreateDevice = {
        name: "Test Device",
        type: "mutable",
      };

      const result = deviceBaseSchema.safeParse({
        operation: "create",
        createDevice: validCreateDevice,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createDevice?.name).toBe("Test Device");
        expect(result.data.createDevice?.type).toBe("mutable");
      }
    });

    it("should accept createDevice with all optional fields", () => {
      const completeCreateDevice = {
        name: "Complete Device",
        type: "immutable",
        connector: "507f1f77bcf86cd799439011",
        network: "507f1f77bcf86cd799439012",
        tags: [{ key: "device_type", value: "sensor" }],
        description: "A complete test device",
        active: true,
        visible: true,
        configuration_params: [
          {
            sent: true,
            key: "test_param",
            value: "test_value",
          },
        ],
        connector_parse: true,
        serie_number: "ABC123",
        chunk_period: "day",
        chunk_retention: 30,
        payload_decoder: "function decode(payload) { return payload; }",
      };

      const result = deviceBaseSchema.safeParse({
        operation: "create",
        createDevice: completeCreateDevice,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createDevice).toEqual(completeCreateDevice);
      }
    });

    it("should reject createDevice with missing required fields", () => {
      const incompleteCreateDevice = {
        name: "Test Device",
        // Missing type
      };

      const result = deviceBaseSchema.safeParse({
        operation: "create",
        createDevice: incompleteCreateDevice,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map(issue => issue.path.join("."));
        expect(paths).toContain("createDevice.type");
      }
    });

    it("should reject createDevice with invalid type", () => {
      const invalidCreateDevice = {
        name: "Test Device",
        type: "invalid_type",
      };

      const result = deviceBaseSchema.safeParse({
        operation: "create",
        createDevice: invalidCreateDevice,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_enum_value");
        expect(result.error.issues[0].path).toEqual(["createDevice", "type"]);
      }
    });

    it("should reject createDevice with invalid chunk_period", () => {
      const invalidCreateDevice = {
        name: "Test Device",
        type: "immutable",
        chunk_period: "invalid_period",
      };

      const result = deviceBaseSchema.safeParse({
        operation: "create",
        createDevice: invalidCreateDevice,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_enum_value");
        expect(result.error.issues[0].path).toEqual(["createDevice", "chunk_period"]);
      }
    });
  });

  describe("LookupDevice Validation", () => {
    it("should accept valid lookupDevice with filter", () => {
      const validLookupDevice = {
        amount: 50,
        fields: ["id", "name", "active"],
        filter: {
          name: "test",
          active: true,
          type: "mutable",
          tags: [{ key: "device_type", value: "sensor" }],
        },
      };

      const result = deviceBaseSchema.safeParse({
        operation: "lookup",
        lookupDevice: validLookupDevice,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Name gets transformed to include wildcards
        const expectedResult = {
          ...validLookupDevice,
          filter: {
            ...validLookupDevice.filter,
            name: "*test*", // Zod transforms name with wildcards
          },
        };
        expect(result.data.lookupDevice).toEqual(expectedResult);
      }
    });

    it("should accept lookupDevice with all filter options", () => {
      const fullLookupDevice = {
        amount: 100,
        fields: ["id", "active", "name", "tags", "created_at", "updated_at", "connector", "network", "type"],
        filter: {
          id: "507f1f77bcf86cd799439011",
          name: "sensor device",
          active: false,
          connector: "507f1f77bcf86cd799439012",
          network: "507f1f77bcf86cd799439013",
          type: "immutable",
          tags: [
            { key: "category", value: "environmental" },
            { key: "location", value: "outdoor" },
          ],
        },
        include_data_amount: true,
      };

      const result = deviceBaseSchema.safeParse({
        operation: "lookup",
        lookupDevice: fullLookupDevice,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Name gets transformed to include wildcards
        const expectedResult = {
          ...fullLookupDevice,
          filter: {
            ...fullLookupDevice.filter,
            name: "*sensor device*", // Zod transforms name with wildcards
          },
        };
        expect(result.data.lookupDevice).toEqual(expectedResult);
      }
    });

    it("should reject lookupDevice with invalid field names", () => {
      const invalidLookupDevice = {
        fields: ["invalid_field", "another_invalid"],
      };

      const result = deviceBaseSchema.safeParse({
        operation: "lookup",
        lookupDevice: invalidLookupDevice,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_enum_value");
        expect(result.error.issues[0].path).toEqual(["lookupDevice", "fields", 0]);
      }
    });

    it("should reject lookupDevice with invalid device ID length", () => {
      const invalidLookupDevice = {
        filter: {
          id: "short_id", // Too short for device ID
        },
      };

      const result = deviceBaseSchema.safeParse({
        operation: "lookup",
        lookupDevice: invalidLookupDevice,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("too_small");
        expect(result.error.issues[0].path).toEqual(["lookupDevice", "filter", "id"]);
      }
    });
  });

  describe("TokenListDevice Validation", () => {
    it("should accept valid tokenListDevice", () => {
      const validTokenListDevice = {
        amount: 10,
        fields: ["id", "name", "token", "serie_number", "permission", "created_at"],
        filter: {
          name: "test_token",
          serie_number: "ABC123",
          permission: "full",
        },
      };

      const result = deviceBaseSchema.safeParse({
        operation: "token-list",
        tokenListDevice: validTokenListDevice,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Name gets transformed to include wildcards
        const expectedResult = {
          ...validTokenListDevice,
          filter: {
            ...validTokenListDevice.filter,
            name: "*test_token*", // Zod transforms name with wildcards
          },
        };
        expect(result.data.tokenListDevice).toEqual(expectedResult);
      }
    });

    it("should reject tokenListDevice with invalid permission", () => {
      const invalidTokenListDevice = {
        filter: {
          permission: "invalid_permission",
        },
      };

      const result = deviceBaseSchema.safeParse({
        operation: "token-list",
        tokenListDevice: invalidTokenListDevice,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_enum_value");
        expect(result.error.issues[0].path).toEqual(["tokenListDevice", "filter", "permission"]);
      }
    });
  });

  describe("TokenCreateDevice Validation", () => {
    it("should accept valid tokenCreateDevice", () => {
      const validTokenCreateDevice = {
        name: "Test Token",
        permission: "full",
        serie_number: "TOKEN123",
      };

      const result = deviceBaseSchema.safeParse({
        operation: "token-create",
        tokenCreateDevice: validTokenCreateDevice,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tokenCreateDevice).toEqual(validTokenCreateDevice);
      }
    });

    it("should accept tokenCreateDevice with only required fields", () => {
      const minimalTokenCreateDevice = {
        name: "Minimal Token",
      };

      const result = deviceBaseSchema.safeParse({
        operation: "token-create",
        tokenCreateDevice: minimalTokenCreateDevice,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tokenCreateDevice?.name).toBe("Minimal Token");
      }
    });

    it("should reject tokenCreateDevice with missing name", () => {
      const invalidTokenCreateDevice = {
        permission: "full",
      };

      const result = deviceBaseSchema.safeParse({
        operation: "token-create",
        tokenCreateDevice: invalidTokenCreateDevice,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["tokenCreateDevice", "name"]);
        expect(result.error.issues[0].message).toBe("Required");
      }
    });

    it("should reject tokenCreateDevice with invalid permission", () => {
      const invalidTokenCreateDevice = {
        name: "Test Token",
        permission: "invalid_permission",
      };

      const result = deviceBaseSchema.safeParse({
        operation: "token-create",
        tokenCreateDevice: invalidTokenCreateDevice,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_enum_value");
        expect(result.error.issues[0].path).toEqual(["tokenCreateDevice", "permission"]);
      }
    });
  });

  describe("TokenDeleteDevice Validation", () => {
    it("should accept valid tokenDeleteDevice", () => {
      const validTokenDeleteDevice = {
        token: "a4e96fc6-c286-4d0f-b7d6-a887339ad2bc",
      };

      const result = deviceBaseSchema.safeParse({
        operation: "token-delete",
        tokenDeleteDevice: validTokenDeleteDevice,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tokenDeleteDevice?.token).toBe("a4e96fc6-c286-4d0f-b7d6-a887339ad2bc");
      }
    });

    it("should reject tokenDeleteDevice with missing token", () => {
      const invalidTokenDeleteDevice = {};

      const result = deviceBaseSchema.safeParse({
        operation: "token-delete",
        tokenDeleteDevice: invalidTokenDeleteDevice,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["tokenDeleteDevice", "token"]);
      }
    });
  });

  describe("ParameterListDevice Validation", () => {
    it("should accept valid parameterListDevice", () => {
      const validParameterListDevice = {
        sentStatus: true,
      };

      const result = deviceBaseSchema.safeParse({
        operation: "parameter-list",
        parameterListDevice: validParameterListDevice,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parameterListDevice?.sentStatus).toBe(true);
      }
    });

    it("should accept parameterListDevice without sentStatus", () => {
      const result = deviceBaseSchema.safeParse({
        operation: "parameter-list",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parameterListDevice).toBeUndefined();
      }
    });
  });

  describe("ParameterSetDevice Validation", () => {
    it("should accept valid parameterSetDevice", () => {
      const validParameterSetDevice = {
        configObj: [
          {
            sent: true,
            key: "api_endpoint",
            value: "https://api.example.com",
          },
          {
            id: "param123",
            sent: false,
            key: "timeout",
            value: "30",
          },
        ],
      };

      const result = deviceBaseSchema.safeParse({
        operation: "parameter-set",
        parameterSetDevice: validParameterSetDevice,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parameterSetDevice?.configObj).toEqual(validParameterSetDevice.configObj);
      }
    });

    it("should reject parameterSetDevice with invalid configuration", () => {
      const invalidParameterSetDevice = {
        configObj: [
          {
            // Missing required fields
            value: "test_value",
          },
        ],
      };

      const result = deviceBaseSchema.safeParse({
        operation: "parameter-set",
        parameterSetDevice: invalidParameterSetDevice,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map(issue => issue.path.join("."));
        expect(paths).toContain("parameterSetDevice.configObj.0.sent");
        expect(paths).toContain("parameterSetDevice.configObj.0.key");
      }
    });
  });

  describe("ParameterRemoveDevice Validation", () => {
    it("should accept valid parameterRemoveDevice", () => {
      const validParameterRemoveDevice = {
        paramID: "param123456789012345678901234",
      };

      const result = deviceBaseSchema.safeParse({
        operation: "parameter-remove",
        parameterRemoveDevice: validParameterRemoveDevice,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parameterRemoveDevice?.paramID).toBe("param123456789012345678901234");
      }
    });

    it("should reject parameterRemoveDevice with missing paramID", () => {
      const invalidParameterRemoveDevice = {};

      const result = deviceBaseSchema.safeParse({
        operation: "parameter-remove",
        parameterRemoveDevice: invalidParameterRemoveDevice,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe("invalid_type");
        expect(result.error.issues[0].path).toEqual(["parameterRemoveDevice", "paramID"]);
      }
    });
  });

  describe("Schema Refinement Validation", () => {
    it("should reject create operation without createDevice", () => {
      const result = deviceSchema.safeParse({
        operation: "create",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Create requires createDevice");
      }
    });

    it("should reject update operation without updateDevice", () => {
      const result = deviceSchema.safeParse({
        operation: "update",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("update requires updateDevice");
      }
    });

    it("should reject token-create operation without tokenCreateDevice", () => {
      const result = deviceSchema.safeParse({
        operation: "token-create",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("token-create requires tokenCreateDevice");
      }
    });

    it("should accept lookup operation without lookupDevice", () => {
      const result = deviceSchema.safeParse({
        operation: "lookup",
      });

      expect(result.success).toBe(true);
    });

    it("should accept delete operation with only deviceID", () => {
      const result = deviceSchema.safeParse({
        operation: "delete",
        deviceID: "123456789012345678901234",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty objects gracefully", () => {
      const result = deviceBaseSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should handle null values", () => {
      const result = deviceBaseSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it("should handle undefined values", () => {
      const result = deviceBaseSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it("should handle arrays instead of objects", () => {
      const result = deviceBaseSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    it("should handle strings instead of objects", () => {
      const result = deviceBaseSchema.safeParse("invalid");
      expect(result.success).toBe(false);
    });
  });

  describe("Complex Scenarios", () => {
    it("should validate complete device creation with all fields", () => {
      const completeDeviceData = {
        operation: "create",
        createDevice: {
          name: "IoT Temperature Sensor",
          type: "immutable",
          connector: "507f1f77bcf86cd799439011",
          network: "507f1f77bcf86cd799439012",
          tags: [
            { key: "location", value: "warehouse" },
            { key: "type", value: "temperature" },
            { key: "vendor", value: "acme" },
          ],
          description: "High-precision temperature sensor for warehouse monitoring",
          active: true,
          visible: true,
          configuration_params: [
            {
              id: "param1",
              sent: true,
              key: "sampling_rate",
              value: "60",
            },
            {
              sent: false,
              key: "alert_threshold",
              value: "25.0",
            },
          ],
          connector_parse: true,
          serie_number: "TEMP-2024-001",
          chunk_period: "day",
          chunk_retention: 90,
          payload_decoder: "function decode(payload) { return JSON.parse(payload); }",
        },
      };

      const result = deviceBaseSchema.safeParse(completeDeviceData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe("create");
        expect(result.data.createDevice?.name).toBe("IoT Temperature Sensor");
        expect(result.data.createDevice?.tags).toHaveLength(3);
        expect(result.data.createDevice?.configuration_params).toHaveLength(2);
      }
    });

    it("should validate device lookup with complex filters", () => {
      const complexLookupData = {
        operation: "lookup",
        lookupDevice: {
          amount: 25,
          page: 2,
          fields: ["id", "name", "active", "tags", "created_at"],
          filter: {
            name: "sensor",
            active: true,
            type: "mutable",
            connector: "507f1f77bcf86cd799439011",
            network: "507f1f77bcf86cd799439012",
            tags: [
              { key: "environment", value: "production" },
              { key: "region", value: "us-west" },
            ],
          },
          include_data_amount: false,
        },
      };

      const result = deviceBaseSchema.safeParse(complexLookupData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe("lookup");
        expect(result.data.lookupDevice?.filter?.tags).toHaveLength(2);
        expect(result.data.lookupDevice?.amount).toBe(25);
      }
    });
  });
}); 