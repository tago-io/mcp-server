import { inspect } from "node:util";

import type { Resources } from "@tago-io/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TAGOIO_REGION, VALID_REGIONS, classifyCredential, extractToken, isTokenError, regionFromApiUrl, regionFromCode, validateTagoToken } from "./shared";

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

describe("classifyCredential", () => {
  it("classifies p- tokens as profile", () => {
    expect(classifyCredential("p-0000000000000000000000000000000000")).toBe("profile");
  });

  it("classifies a- tokens as analysis", () => {
    expect(classifyCredential("a-0000000000000000000000000000000000")).toBe("analysis");
  });

  it("classifies unprefixed tokens as device", () => {
    expect(classifyCredential("00000000-0000-4000-8000-000000000001")).toBe("device");
  });

  it("rejects unsupported single-letter prefixes", () => {
    expect(() => classifyCredential("t-0000000000000000000000000000000000")).toThrow(/Unsupported token kind/);
    expect(() => classifyCredential("X-0000000000000000000000000000000000")).toThrow(/Unsupported token kind/);
    expect(() => classifyCredential("u-0000000000000000000000000000000000")).toThrow(/Unsupported token kind/);
    expect(() => classifyCredential("n-0000000000000000000000000000000000")).toThrow(/Unsupported token kind/);
  });

  it("rejects Service Authorization tokens (at prefix) instead of treating them as device tokens", () => {
    expect(() => classifyCredential("at")).toThrow(/Service Authorization/);
    expect(() => classifyCredential("at-0000000000000000000000000000000000")).toThrow(/Service Authorization/);
    expect(() => classifyCredential("at0000000000000000000000000000000000")).toThrow(/Service Authorization/);
  });
});

describe("regionFromCode", () => {
  it("builds correct URLs for us-e1 region", () => {
    const region = regionFromCode("us-e1");
    expect(region?.api).toBe("https://api.us-e1.tago.io");
    expect(region?.sse).toBe("https://sse.us-e1.tago.io");
  });

  it("builds correct URLs for eu-w1 region", () => {
    const region = regionFromCode("eu-w1");
    expect(region?.api).toBe("https://api.eu-w1.tago.io");
    expect(region?.sse).toBe("https://sse.eu-w1.tago.io");
  });

  it.each([
    "custom-region",
    "http://evil.example.com",
    "https://127.0.0.1",
    "localhost",
    "api.internal:8080",
    "169.254.169.254",
    "10.0.0.1",
    "us-e1/../eu-w1",
    "https://user:pass@api.us-e1.tago.io",
    "https://api.us-e1.tago.io",
    "api.6722812c934c3c3370e0b87d.tagoio.net",
    "",
  ])("rejects %j (outside the allowlist)", (value) => {
    expect(regionFromCode(value), value).toBeNull();
  });
});

describe("regionFromApiUrl", () => {
  it("accepts an operator-configured https endpoint and derives the SSE endpoint", () => {
    const region = regionFromApiUrl("https://api.6722812c934c3c3370e0b87d.tagoio.net");
    expect(region.api).toBe("https://api.6722812c934c3c3370e0b87d.tagoio.net");
    expect(region.sse).toBe("https://sse.6722812c934c3c3370e0b87d.tagoio.net");
  });

  it("strips paths and trailing slashes down to the origin", () => {
    const region = regionFromApiUrl("https://api.acme.tagoio.net/some/path/");
    expect(region.api).toBe("https://api.acme.tagoio.net");
    expect(region.sse).toBe("https://sse.acme.tagoio.net");
  });

  it("rejects non-https URLs", () => {
    expect(() => regionFromApiUrl("http://api.acme.tagoio.net")).toThrow(/https/);
  });

  it("rejects bare hosts without a scheme", () => {
    expect(() => regionFromApiUrl("api.acme.tagoio.net")).toThrow();
  });
});

describe("validateTagoToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["http://evil.example.com", "https://127.0.0.1", "localhost", "api.internal:8080", "unknown-code"])(
    "rejects hostile region header %j before any outbound request",
    async (value) => {
      const fetchMock = vi.fn(() => Promise.reject(new Error("must not be called")));
      vi.stubGlobal("fetch", fetchMock);

      const result = await validateTagoToken("a-0000000000000000000000000000000000", value);
      expect(isTokenError(result), value).toBe(true);
      expect((result as { statusCode: number }).statusCode).toBe(400);
      expect((result as { error: string }).error).toContain("Invalid x-tagoio-region");

      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(["t-0000000000000000000000000000000000", "u-0000000000000000000000000000000000", "at-0000000000000000000000000000000000"])(
    "rejects unsupported token kind %j before any outbound request",
    async (token) => {
      const fetchMock = vi.fn(() => Promise.reject(new Error("must not be called")));
      vi.stubGlobal("fetch", fetchMock);

      const result = await validateTagoToken(token, "us-e1");
      expect(isTokenError(result), token).toBe(true);
      expect((result as { statusCode: number }).statusCode).toBe(401);
      expect((result as { error: string }).error).toContain("Unsupported token kind");

      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  function stubInfoResponse(result: unknown) {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ status: true, result }), { status: 200, headers: { "content-type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("preserves the authenticated device identity for device tokens", async () => {
    stubInfoResponse({ id: "61f0000000000000000d0001", name: "Sensor", type: "mutable" });

    const result = await validateTagoToken("00000000-0000-4000-8000-000000000001", "us-e1");
    expect(isTokenError(result)).toBe(false);
    expect((result as { credential: unknown }).credential).toEqual({ credentialKind: "device", authenticatedDeviceId: "61f0000000000000000d0001" });
  });

  it("rejects device tokens whose introspection carries no device identity", async () => {
    stubInfoResponse({ name: "Profile-shaped response without an id" });

    const result = await validateTagoToken("00000000-0000-4000-8000-000000000001", "us-e1");
    expect(isTokenError(result)).toBe(true);
    expect((result as { statusCode: number }).statusCode).toBe(401);
  });

  it("never logs the request credential when the API reflects it in a validation failure", async () => {
    const token = "p-c1sentinel00000000000000000000000000";
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ status: false, message: `Invalid token: ${token}` }), { status: 401, headers: { "content-type": "application/json" } }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await validateTagoToken(token, "us-e1");
      expect(isTokenError(result)).toBe(true);
      expect((result as { statusCode: number }).statusCode).toBe(401);
      expect((result as { error: string }).error).not.toContain(token);

      const logged = consoleSpy.mock.calls.map((call) => call.map((arg) => inspect(arg, { depth: Infinity })).join(" ")).join("\n");
      expect(logged).not.toContain(token);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  describe("operator-configured dedicated endpoint", () => {
    const DEDICATED = "https://api.6722812c934c3c3370e0b87d.tagoio.net";

    // The stub declares no parameters, so its recorded calls are typed as empty
    // tuples; the arguments are still there at runtime.
    function requestedHosts(fetchMock: ReturnType<typeof stubInfoResponse>): string[] {
      return (fetchMock.mock.calls as unknown as unknown[][]).map(([target]) => new URL(target instanceof Request ? target.url : String(target)).origin);
    }

    it("sends the token to the configured instance, not to a public region", async () => {
      const fetchMock = stubInfoResponse({ name: "Test Profile Token", type: "profile" });

      const result = await validateTagoToken("p-0000000000000000000000000000000000", DEFAULT_TAGOIO_REGION, DEDICATED);

      expect(isTokenError(result)).toBe(false);
      expect((result as { region: { api: string } }).region.api).toBe(DEDICATED);
      expect(requestedHosts(fetchMock).every((origin) => origin === DEDICATED)).toBe(true);
    });

    // The header is not the client's decision on a pinned deployment, so a
    // stale or defaulted region code must not redirect the credential.
    it("ignores the region header entirely, including one naming another region", async () => {
      const fetchMock = stubInfoResponse({ name: "Test Profile Token", type: "profile" });

      const result = await validateTagoToken("p-0000000000000000000000000000000000", "eu-w1", DEDICATED);

      expect(isTokenError(result)).toBe(false);
      expect((result as { region: { api: string } }).region.api).toBe(DEDICATED);
      expect(requestedHosts(fetchMock)).not.toContain("https://api.eu-w1.tago.io");
    });

    // A region code the allowlist rejects still cannot reach the wire, but on a
    // pinned deployment it is simply irrelevant rather than an error.
    it("does not consult the allowlist at all when pinned", async () => {
      const fetchMock = stubInfoResponse({ name: "Test Profile Token", type: "profile" });

      const result = await validateTagoToken("p-0000000000000000000000000000000000", "http://evil.example.com", DEDICATED);

      expect(isTokenError(result)).toBe(false);
      expect(requestedHosts(fetchMock).every((origin) => origin === DEDICATED)).toBe(true);
    });
  });

  it("carries no device identity for profile and analysis tokens", async () => {
    stubInfoResponse({ name: "Test Profile Token", type: "profile" });

    const result = await validateTagoToken("p-0000000000000000000000000000000000", "us-e1");
    expect(isTokenError(result)).toBe(false);
    expect((result as { credential: unknown }).credential).toEqual({ credentialKind: "profile" });
  });
});

describe("isTokenError", () => {
  it("returns true for error results", () => {
    expect(isTokenError({ error: "Unauthorized", statusCode: 401 })).toBe(true);
  });

  it("returns false for success results", () => {
    const fakeResources = {} as Resources;
    expect(
      isTokenError({
        resources: fakeResources,
        region: { api: "https://api.us-e1.tago.io", sse: "https://sse.us-e1.tago.io" },
        credential: { credentialKind: "analysis" },
      })
    ).toBe(false);
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
