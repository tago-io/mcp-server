import { describe, it, expect } from "vitest";

import { profileMetricsSchema } from "../profile-metrics";

describe("Profile Metrics Tool", () => {
  describe("profileMetricsSchema", () => {
    it("should accept 'limits' as type", () => {
      const result = profileMetricsSchema.safeParse({ type: "limits" });
      expect(result.success).toBe(true);
    });

    it("should accept 'statistics' as type", () => {
      const result = profileMetricsSchema.safeParse({ type: "statistics" });
      expect(result.success).toBe(true);
    });

    it("should reject invalid type", () => {
      const result = profileMetricsSchema.safeParse({ type: "invalid" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid enum value");
      }
    });

    it("should reject missing type", () => {
      const result = profileMetricsSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Required");
      }
    });
  });
});
