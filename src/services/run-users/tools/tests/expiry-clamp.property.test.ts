import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { clampExpireTime, MAX_EXPIRE_MINUTES } from "../../expiry-clamp";

/** Parses a normalized "N minute(s)/hour(s)" string back into minutes. */
function toMinutes(normalized: string): number {
  const match = normalized.match(/^(\d+)\s+(minute|minutes|hour|hours)$/);
  if (!match) {
    throw new Error(`unexpected normalized form: ${normalized}`);
  }
  const quantity = Number(match[1]);
  return match[2].startsWith("hour") ? quantity * 60 : quantity;
}

describe("clampExpireTime properties", () => {
  it("accepts only durations inside [1, 120] minutes and always returns a bounded normalized form", () => {
    const unit = fc.constantFrom("minute", "minutes", "hour", "hours");
    const spacing = fc.constantFrom(" ", "  ", "\t");
    fc.assert(
      fc.property(fc.nat({ max: 5000 }), unit, spacing, (quantity, chosenUnit, gap) => {
        const input = `${quantity}${gap}${chosenUnit}`;
        const requestedMinutes = chosenUnit.startsWith("hour") ? quantity * 60 : quantity;
        if (requestedMinutes >= 1 && requestedMinutes <= MAX_EXPIRE_MINUTES) {
          const minutes = toMinutes(clampExpireTime(input));
          expect(minutes).toBe(requestedMinutes);
          expect(minutes).toBeGreaterThanOrEqual(1);
          expect(minutes).toBeLessThanOrEqual(MAX_EXPIRE_MINUTES);
        } else {
          expect(() => clampExpireTime(input)).toThrow();
        }
      }),
      { numRuns: 2000 }
    );
  });

  it("rejects every 'never'-like literal regardless of casing and surrounding space", () => {
    const casing = fc.mixedCase(fc.constant("never"));
    fc.assert(
      fc.property(casing, fc.constantFrom("", " ", "  ", "\t"), (word, pad) => {
        expect(() => clampExpireTime(`${pad}${word}${pad}`)).toThrow();
      }),
      { numRuns: 500 }
    );
  });

  it("rejects arbitrary garbage strings (fails closed, never throws uncontrolled)", () => {
    const looksValid = (value: string) => /^\s*\d+\s+(minute|minutes|hour|hours)\s*$/.test(value.toLowerCase());
    fc.assert(
      fc.property(fc.string(), (value) => {
        fc.pre(!looksValid(value));
        expect(() => clampExpireTime(value)).toThrow();
      }),
      { numRuns: 2000 }
    );
  });
});
