import { describe, it, expect } from "vitest";

import { getDeviceDataSchema } from "../tools/get-device-data";

describe("getDeviceDataSchema", () => {
  const validDeviceID = "d".repeat(24);

  it("should validate a minimal valid device data query", () => {
    const validInput = {
      deviceID: validDeviceID,
    };
    expect(() => getDeviceDataSchema.parse(validInput)).not.toThrow();
  });

  it("should reject deviceID with less than 24 chars", () => {
    const invalidInput = {
      deviceID: "shortid",
    };
    expect(() => getDeviceDataSchema.parse(invalidInput)).toThrow();
  });

  it("should reject deviceID with more than 24 chars", () => {
    const invalidInput = {
      deviceID: "x".repeat(25),
    };
    expect(() => getDeviceDataSchema.parse(invalidInput)).toThrow();
  });

  it("should validate a complete valid device data query", () => {
    const validInput = {
      deviceID: validDeviceID,
      variables: ["temp", "humidity"],
      groups: ["group1", "group2"],
      ids: ["id1", "id2"],
      values: ["25.5", "high", "true"],
      qty: 100,
      start_date: "2024-03-20T00:00:00Z",
      end_date: "2024-03-20T23:59:59Z",
      ordination: "ascending",
      interval: "day",
      function: "avg",
      value: 10,
    };
    expect(() => getDeviceDataSchema.parse(validInput)).not.toThrow();
  });

  it("should validate single string values for variables, groups, and ids", () => {
    const validInput = {
      deviceID: validDeviceID,
      variables: ["temp"],
      groups: ["group1"],
      ids: ["id1"],
    };
    expect(() => getDeviceDataSchema.parse(validInput)).not.toThrow();
  });

  it("should reject missing required deviceID", () => {
    const invalidInput = {
      variables: ["temp"],
    };
    expect(() => getDeviceDataSchema.parse(invalidInput)).toThrow("Device ID is required");
  });

  it("should validate string dates for start_date and end_date", () => {
    const validInput = {
      deviceID: validDeviceID,
      start_date: "2024-03-20T00:00:00Z",
      end_date: "2024-03-20T23:59:59Z",
    };
    expect(() => getDeviceDataSchema.parse(validInput)).not.toThrow();
  });

  it("should reject non-string values in values array", () => {
    const invalidInput = {
      deviceID: validDeviceID,
      values: [25.5, "high", true], // numbers and booleans should be rejected now
    };
    expect(() => getDeviceDataSchema.parse(invalidInput)).toThrow();
  });

  it("should accept string values in values array", () => {
    const validInput = {
      deviceID: validDeviceID,
      values: ["25.5", "high", "true"], // all strings should be accepted
    };
    expect(() => getDeviceDataSchema.parse(validInput)).not.toThrow();
  });

  it("should reject invalid qty type", () => {
    const invalidInput = {
      deviceID: validDeviceID,
      qty: "100",
    };
    expect(() => getDeviceDataSchema.parse(invalidInput)).toThrow();
  });

  it("should reject qty above 10000", () => {
    const invalidInput = {
      deviceID: validDeviceID,
      qty: 10001,
    };
    expect(() => getDeviceDataSchema.parse(invalidInput)).toThrow();
  });

  it("should reject qty below 1", () => {
    const invalidInput = {
      deviceID: validDeviceID,
      qty: 0,
    };
    expect(() => getDeviceDataSchema.parse(invalidInput)).toThrow();
  });

  it("should reject negative qty", () => {
    const invalidInput = {
      deviceID: validDeviceID,
      qty: -1,
    };
    expect(() => getDeviceDataSchema.parse(invalidInput)).toThrow();
  });

  it("should reject invalid ordination", () => {
    const invalidInput = {
      deviceID: validDeviceID,
      ordination: "random",
    };
    expect(() => getDeviceDataSchema.parse(invalidInput)).toThrow();
  });

  it("should reject invalid interval", () => {
    const invalidInput = {
      deviceID: validDeviceID,
      interval: "week",
    };
    expect(() => getDeviceDataSchema.parse(invalidInput)).toThrow();
  });

  it("should reject invalid function", () => {
    const invalidInput = {
      deviceID: validDeviceID,
      function: "median",
    };
    expect(() => getDeviceDataSchema.parse(invalidInput)).toThrow();
  });

  it("should reject value as non-number", () => {
    const invalidInput = {
      deviceID: validDeviceID,
      value: "not-a-number",
    };
    expect(() => getDeviceDataSchema.parse(invalidInput)).toThrow();
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
    expect(() => getDeviceDataSchema.parse(validInput)).not.toThrow();
  });
});
