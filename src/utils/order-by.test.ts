import { describe, expect, it } from "vitest";

import { parseOrderBy } from "./order-by";

const FIELDS = ["name", "active", "created_at"] as const;

describe("parseOrderBy", () => {
  it("parses 'field,direction' into the SDK tuple", () => {
    expect(parseOrderBy("name,asc", FIELDS)).toEqual(["name", "asc"]);
    expect(parseOrderBy("created_at,desc", FIELDS)).toEqual(["created_at", "desc"]);
  });

  it("tolerates whitespace around the parts", () => {
    expect(parseOrderBy(" name , desc ", FIELDS)).toEqual(["name", "desc"]);
  });

  it("rejects an invalid direction with an actionable message", () => {
    expect(() => parseOrderBy("name,ascending", FIELDS)).toThrow(/orderBy.*asc or desc.*Valid example/s);
  });

  it("rejects input without a comma", () => {
    expect(() => parseOrderBy("name", FIELDS)).toThrow(/orderBy/);
  });

  it("rejects an empty field", () => {
    expect(() => parseOrderBy(",asc", FIELDS)).toThrow(/orderBy/);
  });

  it("rejects a field outside the allowed list", () => {
    expect(() => parseOrderBy("secret,asc", FIELDS)).toThrow(/name, active, created_at/);
  });

  it("rejects extra comma-separated parts", () => {
    expect(() => parseOrderBy("name,asc,extra", FIELDS)).toThrow(/orderBy/);
  });
});
