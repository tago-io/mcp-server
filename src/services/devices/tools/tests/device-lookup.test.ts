import { describe, it, expect } from "vitest";
import { ZodError } from "zod/v3";
import { deviceBaseSchema } from "../device-operations";

describe("deviceBaseSchema", () => {
  describe("Operation Validation", () => {
    it("should validate all valid operations", () => {
      const operations = ["lookup", "delete", "create", "update"];

      for (const operation of operations) {
        expect(() => deviceBaseSchema.parse({ operation })).not.toThrow();
      }
    });

    it("should reject invalid operations", () => {
      expect(() => deviceBaseSchema.parse({ operation: "invalid" })).toThrow(ZodError);
      expect(() => deviceBaseSchema.parse({})).toThrow(ZodError);
    });
  });

  describe("DeviceID Validation", () => {
    it("should accept valid deviceID", () => {
      const schema = {
        operation: "lookup",
        deviceID: "507f1f77bcf86cd799439011",
      };
      expect(() => deviceBaseSchema.parse(schema)).not.toThrow();
    });

    it("should accept missing deviceID for optional operations", () => {
      expect(() => deviceBaseSchema.parse({ operation: "lookup" })).not.toThrow();
    });

    it("should reject non-string deviceID", () => {
      const schema = {
        operation: "lookup",
        deviceID: 12345,
      };
      expect(() => deviceBaseSchema.parse(schema)).toThrow(ZodError);
    });
  });

  describe("LookupDevice Validation", () => {
    it("should validate complete lookupDevice", () => {
      const schema = {
        operation: "lookup",
        lookupDevice: {
          amount: 10,
          page: 1,
          fields: ["id", "name"],
          filter: {
            name: "test_device",
            active: true,
            type: "mutable",
            tags: [{ key: "device_type", value: "sensor" }],
          },
          include_data_amount: true,
        },
      };
      expect(() => deviceBaseSchema.parse(schema)).not.toThrow();
    });

    it("should reject invalid filter deviceID length", () => {
      const schema = {
        operation: "lookup",
        lookupDevice: {
          filter: { id: "invalid_id" },
        },
      };
      expect(() => deviceBaseSchema.parse(schema)).toThrow(ZodError);
    });

    it("should transform name filter to include wildcards", () => {
      const schema = {
        operation: "lookup",
        lookupDevice: {
          filter: { name: "sensor" },
        },
      };
      const result = deviceBaseSchema.parse(schema);
      expect(result.lookupDevice?.filter?.name).toBe("*sensor*");
    });
  });

  describe("CreateDevice Validation", () => {
    it("should validate minimal createDevice", () => {
      const schema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "mutable",
        },
      };
      expect(() => deviceBaseSchema.parse(schema)).not.toThrow();
    });

    it("should validate complete createDevice", () => {
      const schema = {
        operation: "create",
        createDevice: {
          name: "Complex Device",
          type: "immutable",
          connector: "507f1f77bcf86cd799439011",
          network: "507f1f77bcf86cd799439022",
          description: "Test device",
          active: true,
          chunk_period: "month",
          chunk_retention: 12,
          tags: [{ key: "environment", value: "test" }],
          configuration_params: [
            {
              key: "api_endpoint",
              value: "https://api.example.com",
              sent: true,
            },
          ],
        },
      };
      expect(() => deviceBaseSchema.parse(schema)).not.toThrow();
    });

    it("should reject createDevice with missing required fields", () => {
      expect(() =>
        deviceBaseSchema.parse({
          operation: "create",
          createDevice: { type: "mutable" }, // missing name
        })
      ).toThrow(ZodError);

      expect(() =>
        deviceBaseSchema.parse({
          operation: "create",
          createDevice: { name: "Test" }, // missing type
        })
      ).toThrow(ZodError);
    });

    it("should reject invalid enum values", () => {
      expect(() =>
        deviceBaseSchema.parse({
          operation: "create",
          createDevice: {
            name: "Test",
            type: "invalid_type",
          },
        })
      ).toThrow(ZodError);

      expect(() =>
        deviceBaseSchema.parse({
          operation: "create",
          createDevice: {
            name: "Test",
            type: "immutable",
            chunk_period: "invalid_period",
          },
        })
      ).toThrow(ZodError);
    });

    it("should apply default values for connector and network", () => {
      const schema = {
        operation: "create",
        createDevice: {
          name: "Test Device",
          type: "mutable",
        },
      };
      const result = deviceBaseSchema.parse(schema);
      expect(result.createDevice?.connector).toBe("62333bd36977fc001a2990c8");
      expect(result.createDevice?.network).toBe("62336c32ab6e0d0012e06c04");
    });
  });

  describe("UpdateDevice Validation", () => {
    it("should validate updateDevice with partial fields", () => {
      const schema = {
        operation: "update",
        updateDevice: {
          name: "Updated Device",
          active: false,
        },
      };
      expect(() => deviceBaseSchema.parse(schema)).not.toThrow();
    });

    it("should validate empty updateDevice", () => {
      const schema = {
        operation: "update",
        updateDevice: {},
      };
      expect(() => deviceBaseSchema.parse(schema)).not.toThrow();
    });
  });

  describe("Complex Validation Scenarios", () => {
    it("should validate tags and configuration_params structure", () => {
      const schema = {
        operation: "create",
        createDevice: {
          name: "Test",
          type: "mutable",
          tags: [{ key: "invalid_tag" }], // missing value
        },
      };
      expect(() => deviceBaseSchema.parse(schema)).toThrow(ZodError);
    });

    it("should handle multiple validation errors", () => {
      const schema = {
        operation: "create",
        createDevice: {
          name: "",
          type: "invalid_type",
          tags: [{ key: "test" }], // missing required 'value' field
        },
      };

      try {
        deviceBaseSchema.parse(schema);
        // If we reach here, the test should fail
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        // Now we should have multiple errors: empty name, invalid type, invalid tag structure
        expect(zodError.issues.length).toBeGreaterThan(1);
      }
    });
  });
});
