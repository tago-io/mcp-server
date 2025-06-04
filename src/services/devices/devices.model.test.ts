import { z } from "zod";
import { describe, it, expect } from "vitest";

import { deviceListModel, deviceDataModel } from "./devices.model";

describe("Device Models", () => {
  describe("deviceListModel", () => {
    const schema = z.object(deviceListModel);

    it("should validate a valid device list query with all fields", () => {
      const validInput = {
        page: 1,
        amount: 10,
        fields: ["id", "name", "active"],
        filter: { active: true },
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should validate a valid device list query with page and amount", () => {
      const validInput = {
        page: 2,
        amount: 50,
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should validate a valid device list query with fields", () => {
      const validInput = {
        fields: ["id", "name", "active", "description", "created_at", "updated_at", "connector", "network", "type"],
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should validate a valid device list query with filter", () => {
      const validInput = {
        filter: { active: true, type: "mutable" },
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should validate an empty object", () => {
      expect(() => schema.parse({})).not.toThrow();
    });

    it("should reject invalid field names", () => {
      const invalidInput = {
        fields: ["invalid_field", "name"],
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject invalid page number", () => {
      const invalidInput = {
        page: 0,
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject invalid amount", () => {
      const invalidInput = {
        amount: "10",
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should validate optional fields as undefined", () => {
      const validInput = {
        page: undefined,
        amount: undefined,
        fields: undefined,
        filter: undefined,
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });
  });

  describe("deviceDataModel", () => {
    const schema = z.object(deviceDataModel);

    it("should validate a minimal valid device data query", () => {
      const validInput = {
        deviceID: "device-123",
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should validate a complete valid device data query", () => {
      const validInput = {
        deviceID: "device-123",
        variables: ["temp", "humidity"],
        groups: ["group1", "group2"],
        ids: ["id1", "id2"],
        values: ["value1", 42, true],
        qty: 100,
        start_date: "2024-03-20T00:00:00Z",
        end_date: "2024-03-20T23:59:59Z",
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should validate single string values for variables, groups, and ids", () => {
      const validInput = {
        deviceID: "device-123",
        variables: "temp",
        groups: "group1",
        ids: "id1",
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should reject missing required deviceID", () => {
      const invalidInput = {
        variables: ["temp"],
      };
      expect(() => schema.parse(invalidInput)).toThrow("Device ID is required");
    });

    it("should reject invalid date format", () => {
      const invalidInput = {
        deviceID: "device-123",
        start_date: "invalid-date",
        end_date: "2024-03-20",
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject invalid qty type", () => {
      const invalidInput = {
        deviceID: "device-123",
        qty: "100",
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject with maximum qty (10000)", () => {
      const invalidInput = {
        deviceID: "device-123",
        qty: 10001,
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject negative qty", () => {
      const invalidInput = {
        deviceID: "device-123",
        qty: -1,
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should validate optional fields as undefined", () => {
      const validInput = {
        deviceID: "device-123",
        variables: undefined,
        groups: undefined,
        ids: undefined,
        values: undefined,
        qty: undefined,
        start_date: undefined,
        end_date: undefined,
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });
  });
});
