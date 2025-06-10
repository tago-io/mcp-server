import { z } from "zod/v3";
import { describe, it, expect } from "vitest";

import { profileStatisticsModel } from "./profile-metrics.model.js";

describe("profileStatisticsModel", () => {
  const schema = z.object(profileStatisticsModel);
  const validID = "a".repeat(24);

  it("should validate minimal valid input (id only)", () => {
    const validInput = { id: validID };
    expect(() => schema.parse(validInput)).not.toThrow();
  });

  it("should reject id with less than 24 chars", () => {
    const invalidInput = { id: "shortid" };
    expect(() => schema.parse(invalidInput)).toThrow();
  });

  it("should reject id with more than 24 chars", () => {
    const invalidInput = { id: "x".repeat(25) };
    expect(() => schema.parse(invalidInput)).toThrow();
  });

  it("should validate all fields with valid values", () => {
    const validInput = {
      id: validID,
      timezone: "America/New_York",
      date: "2024-03-20T00:00:00Z",
      start_date: "2024-03-01T00:00:00Z",
      end_date: "2024-03-31T23:59:59Z",
      periodicity: "day",
    };
    expect(() => schema.parse(validInput)).not.toThrow();
  });

  it("should accept date, start_date, end_date as Date objects", () => {
    const validInput = {
      id: validID,
      date: new Date("2024-03-20T00:00:00Z"),
      start_date: new Date("2024-03-01T00:00:00Z"),
      end_date: new Date("2024-03-31T23:59:59Z"),
    };
    expect(() => schema.parse(validInput)).not.toThrow();
  });

  it("should accept periodicity as 'hour', 'day', or 'month'", () => {
    for (const periodicity of ["hour", "day", "month"]) {
      const validInput = { id: validID, periodicity };
      expect(() => schema.parse(validInput)).not.toThrow();
    }
  });

  it("should reject invalid periodicity", () => {
    const invalidInput = { id: validID, periodicity: "year" };
    expect(() => schema.parse(invalidInput)).toThrow();
  });

  it("should reject invalid date format (string not ISO)", () => {
    const invalidInput = { id: validID, date: "not-a-date" };
    expect(() => schema.parse(invalidInput)).toThrow();
  });

  it("should reject invalid start_date format", () => {
    const invalidInput = { id: validID, start_date: "not-a-date" };
    expect(() => schema.parse(invalidInput)).toThrow();
  });

  it("should reject invalid end_date format", () => {
    const invalidInput = { id: validID, end_date: "not-a-date" };
    expect(() => schema.parse(invalidInput)).toThrow();
  });

  it("should validate optional fields as undefined", () => {
    const validInput = {
      id: validID,
      timezone: undefined,
      date: undefined,
      start_date: undefined,
      end_date: undefined,
      periodicity: undefined,
    };
    expect(() => schema.parse(validInput)).not.toThrow();
  });
});
