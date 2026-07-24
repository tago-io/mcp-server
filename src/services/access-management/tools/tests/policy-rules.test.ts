import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildMatchTuple, describeMatch, MatchSpec, parseMatchTuple } from "../../policy-rules";

/**
 * The tuple grammar is the whole reason this domain validates before writing.
 * The API stores `resource` and `targets` as bare `string[]` with no arity
 * check, then classifies them by length and separator words at evaluation time;
 * anything it cannot classify is saved and silently never matches. These tests
 * pin our builder to the shapes that parser accepts and our parser to the same
 * classification it performs.
 */

const resourceIdArbitrary = fc.array(fc.constantFrom(..."0123456789abcdef".split("")), { minLength: 24, maxLength: 24 }).map((chars) => chars.join(""));

const matchArbitrary: fc.Arbitrary<MatchSpec> = fc.oneof(
  fc.constant<MatchSpec>({ by: "any" }),
  resourceIdArbitrary.map<MatchSpec>((id) => ({ by: "id", id })),
  fc.record({ key: fc.string({ minLength: 1 }), value: fc.string({ minLength: 1 }) }).map<MatchSpec>((tag) => ({ by: "tag", ...tag })),
  fc.string({ minLength: 1 }).map<MatchSpec>((key) => ({ by: "tag_match", key })),
  fc.string({ minLength: 1 }).map<MatchSpec>((path) => ({ by: "path", path }))
);

describe("the wire tuple grammar", () => {
  it("builds exactly the shapes the API's parser classifies", () => {
    expect(buildMatchTuple("device", { by: "any" })).toEqual(["device"]);
    expect(buildMatchTuple("device", { by: "id", id: "61f0000000000000000d0001" })).toEqual(["device", "id", "61f0000000000000000d0001"]);
    expect(buildMatchTuple("device", { by: "tag", key: "device_type", value: "sensor" })).toEqual(["device", "tag.key", "device_type", "tag.value", "sensor"]);
    expect(buildMatchTuple("device", { by: "tag_match", key: "site" })).toEqual(["device", "tag_match", "site"]);
    expect(buildMatchTuple("file", { by: "path", path: "reports/" })).toEqual(["file", "path", "reports/"]);
  });

  it("round-trips every match form through the wire and back", () => {
    fc.assert(
      fc.property(matchArbitrary, (match) => {
        expect(parseMatchTuple(buildMatchTuple("device", match))).toEqual(match);
      })
    );
  });

  it("never builds a tuple the parser would reject", () => {
    fc.assert(
      fc.property(matchArbitrary, (match) => {
        expect(parseMatchTuple(buildMatchTuple("device", match))).toBeDefined();
      })
    );
  });

  /**
   * Each of these is accepted by the API's Zod (`z.array(z.string())`), stored,
   * and then classified as nothing, so the rule exists and grants nothing. Our
   * parser has to agree that they are unclassifiable, which is what lets the
   * read tools mark them INERT instead of rendering a plausible line.
   */
  it.each([
    ["arity 2", ["device", "id"]],
    ["arity 4", ["device", "tag.key", "device_type", "tag.value"]],
    // Arity 6 is what the API's own parser rejects. Note the provider truncates
    // to positions 0 to 4 on the way in, so a stored tuple is never this long;
    // this pins the parser, not the persistence.
    ["arity 6", ["device", "tag.key", "a", "tag.value", "b", "extra"]],
    ["empty", []],
    ["unknown separator", ["device", "name", "sensor"]],
    ["tag separators in the wrong order", ["device", "tag.value", "sensor", "tag.key", "device_type"]],
    ["tag separators misspelled", ["device", "tag_key", "device_type", "tag_value", "sensor"]],
  ])("refuses to classify a %s tuple, exactly as the API does", (_label, tuple) => {
    expect(parseMatchTuple(tuple)).toBeUndefined();
  });
});

describe("rendering a match", () => {
  it("names what each form covers", () => {
    expect(describeMatch("device", { by: "any" })).toBe("any device");
    expect(describeMatch("device", { by: "id", id: "61f0000000000000000d0001" })).toContain("61f0000000000000000d0001");
    expect(describeMatch("device", { by: "tag", key: "k", value: "v" })).toContain("tagged");
    expect(describeMatch("device", { by: "tag_match", key: "site" })).toContain("target's own value");
    expect(describeMatch("file", { by: "path", path: "reports/" })).toContain("under path");
  });
});
