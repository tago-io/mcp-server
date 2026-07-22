import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SERVER_VERSION } from "./server-config";

const repoRoot = join(__dirname, "../..");

// Regression: package.json, server.json, and the runtime SERVER_VERSION
// drifted apart (3.1.0 vs 3.0.0 vs 3.0.0). package.json is the single source;
// everything else must match it.
describe("version single-sourcing", () => {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8"));

  it("runtime SERVER_VERSION comes from package.json", () => {
    expect(SERVER_VERSION).toBe(packageJson.version);
  });

  it("server.json top-level version matches package.json", () => {
    const serverJson = JSON.parse(readFileSync(join(repoRoot, "server.json"), "utf-8"));
    expect(serverJson.version).toBe(packageJson.version);
  });

  it("every server.json package entry matches package.json", () => {
    const serverJson = JSON.parse(readFileSync(join(repoRoot, "server.json"), "utf-8"));
    for (const pkg of serverJson.packages) {
      expect(pkg.version).toBe(packageJson.version);
    }
  });
});
