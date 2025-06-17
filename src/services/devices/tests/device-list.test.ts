import { describe, it, expect } from "vitest";

import { deviceListSchema } from "../tools/device-lookup";

describe("deviceListModel", () => {
  const schema = deviceListSchema;

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
      fields: ["id", "active", "name", "tags", "created_at", "updated_at", "connector", "network", "type"],
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

  it("should validate include_data_amount", () => {
    const validInput = {
      include_data_amount: true,
    };
    expect(() => schema.parse(validInput)).not.toThrow();
  });

  it("should reject invalid include_data_amount", () => {
    const invalidInput = {
      include_data_amount: "true",
    };
    expect(() => schema.parse(invalidInput)).toThrow();
  });

  it("should transform name filter with wildcard matching", () => {
    const validInput = {
      filter: {
        name: "sensor",
      },
    };
    const result = schema.parse(validInput);
    expect(result.filter?.name).toBe("*sensor*");
  });

  it("should reject invalid name filter type", () => {
    const invalidInput = {
      filter: {
        name: 123,
      },
    };
    expect(() => schema.parse(invalidInput)).toThrow();
  });
});
