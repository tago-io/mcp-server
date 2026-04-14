import { describe, expect, it } from "vitest";
import { DEFAULT_TAGOIO_REGION, VALID_REGIONS, buildRegion, extractToken, isTokenError } from "./shared";

describe("extractToken", () => {
  it("extracts a valid Bearer token", () => {
    expect(extractToken("Bearer my-token-123")).toBe("my-token-123");
  });

  it("is case-insensitive for Bearer prefix", () => {
    expect(extractToken("bearer my-token")).toBe("my-token");
    expect(extractToken("BEARER my-token")).toBe("my-token");
  });

  it("returns null for missing header", () => {
    expect(extractToken(undefined)).toBeNull();
    expect(extractToken(null)).toBeNull();
    expect(extractToken("")).toBeNull();
  });

  it("accepts a raw token without Bearer prefix", () => {
    expect(extractToken("my-raw-token-123")).toBe("my-raw-token-123");
    expect(extractToken("abc123")).toBe("abc123");
  });

  it("returns null for whitespace-only header", () => {
    expect(extractToken("   ")).toBeNull();
  });

  it("preserves token with special characters", () => {
    expect(extractToken("Bearer abc-123_def.456")).toBe("abc-123_def.456");
    expect(extractToken("abc-123_def.456")).toBe("abc-123_def.456");
  });
});

describe("buildRegion", () => {
  it("builds correct URLs for us-e1 region", () => {
    const region = buildRegion("us-e1");
    expect(region.api).toBe("https://api.us-e1.tago.io");
    expect(region.sse).toBe("https://sse.us-e1.tago.io");
  });

  it("builds correct URLs for eu-w1 region", () => {
    const region = buildRegion("eu-w1");
    expect(region.api).toBe("https://api.eu-w1.tago.io");
    expect(region.sse).toBe("https://sse.eu-w1.tago.io");
  });

  it("builds URLs for arbitrary region strings", () => {
    const region = buildRegion("custom-region");
    expect(region.api).toBe("https://api.custom-region.tago.io");
    expect(region.sse).toBe("https://sse.custom-region.tago.io");
  });
});

describe("isTokenError", () => {
  it("returns true for error results", () => {
    expect(isTokenError({ error: "Unauthorized", statusCode: 401 })).toBe(true);
  });

  it("returns false for success results", () => {
    const fakeResources = {} as any;
    expect(isTokenError({ resources: fakeResources })).toBe(false);
  });
});

describe("constants", () => {
  it("has expected valid regions", () => {
    expect(VALID_REGIONS).toContain("us-e1");
    expect(VALID_REGIONS).toContain("eu-w1");
  });

  it("has correct default region", () => {
    expect(DEFAULT_TAGOIO_REGION).toBe("us-e1");
  });
});
