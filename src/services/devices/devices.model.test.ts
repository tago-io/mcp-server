import { z } from "zod/v3";
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

    it("should validate filter with 24-char id, connector, network", () => {
      const validInput = {
        filter: {
          id: "a".repeat(24),
          connector: "b".repeat(24),
          network: "c".repeat(24),
        },
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should reject filter with id, connector, network not 24 chars", () => {
      const invalidInputs = [{ filter: { id: "short" } }, { filter: { connector: "123" } }, { filter: { network: "x".repeat(25) } }];
      for (const input of invalidInputs) {
        expect(() => schema.parse(input)).toThrow();
      }
    });

    it("should reject invalid type in filter", () => {
      const invalidInput = {
        filter: { type: "invalid" },
      };
      expect(() => schema.parse(invalidInput)).toThrow();
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
    const validDeviceID = "d".repeat(24);

    it("should validate a minimal valid device data query", () => {
      const validInput = {
        deviceID: validDeviceID,
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should reject deviceID with less than 24 chars", () => {
      const invalidInput = {
        deviceID: "shortid",
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject deviceID with more than 24 chars", () => {
      const invalidInput = {
        deviceID: "x".repeat(25),
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should validate a complete valid device data query", () => {
      const validInput = {
        deviceID: validDeviceID,
        variables: ["temp", "humidity"],
        groups: ["group1", "group2"],
        ids: ["id1", "id2"],
        values: ["value1", 42, true],
        qty: 100,
        start_date: "2024-03-20T00:00:00Z",
        end_date: "2024-03-20T23:59:59Z",
        ordination: "ascending",
        interval: "day",
        function: "avg",
        value: 10,
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should validate single string values for variables, groups, and ids", () => {
      const validInput = {
        deviceID: validDeviceID,
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

    it("should accept Date object for start_date and end_date", () => {
      const validInput = {
        deviceID: validDeviceID,
        start_date: new Date("2024-03-20T00:00:00Z"),
        end_date: new Date("2024-03-20T23:59:59Z"),
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });

    it("should reject invalid qty type", () => {
      const invalidInput = {
        deviceID: validDeviceID,
        qty: "100",
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject qty above 10000", () => {
      const invalidInput = {
        deviceID: validDeviceID,
        qty: 10001,
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject qty below 1", () => {
      const invalidInput = {
        deviceID: validDeviceID,
        qty: 0,
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject negative qty", () => {
      const invalidInput = {
        deviceID: validDeviceID,
        qty: -1,
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject invalid ordination", () => {
      const invalidInput = {
        deviceID: validDeviceID,
        ordination: "random",
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject invalid interval", () => {
      const invalidInput = {
        deviceID: validDeviceID,
        interval: "week",
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject invalid function", () => {
      const invalidInput = {
        deviceID: validDeviceID,
        function: "median",
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should reject value as non-number", () => {
      const invalidInput = {
        deviceID: validDeviceID,
        value: "not-a-number",
      };
      expect(() => schema.parse(invalidInput)).toThrow();
    });

    it("should validate optional fields as undefined", () => {
      const validInput = {
        deviceID: validDeviceID,
        variables: undefined,
        groups: undefined,
        ids: undefined,
        values: undefined,
        qty: undefined,
        start_date: undefined,
        end_date: undefined,
        ordination: undefined,
        skip: undefined,
        interval: undefined,
        function: undefined,
        value: undefined,
      };
      expect(() => schema.parse(validInput)).not.toThrow();
    });
  });
});
