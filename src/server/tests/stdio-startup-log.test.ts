import { inspect } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { startStdioServer } from "../stdio-server";

const TOKEN = "p-c1stdio000000000000000000000000000000";

/**
 * The stdio startup validation path runs BEFORE buildServer and its tool-result
 * redaction boundary exists, so this suite covers it directly: an SDK failure
 * that reflects the configured TAGOIO_TOKEN must never reach stderr/logger output.
 */
describe("stdio startup validation failure logging", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("never logs the configured token when connection validation fails", async () => {
    vi.stubEnv("TAGOIO_TOKEN", TOKEN);
    vi.stubEnv("TAGOIO_API", "https://api.us-e1.tago.io");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ status: false, message: `Invalid token: ${TOKEN}` }), { status: 401, headers: { "content-type": "application/json" } }))
      )
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(1)");
    });

    await expect(startStdioServer()).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);

    const logged = consoleSpy.mock.calls.map((call) => call.map((arg) => inspect(arg, { depth: Infinity })).join(" ")).join("\n");
    expect(logged).not.toContain(TOKEN);
    expect(logged).toContain("Failed to start MCP server");
  });
});
