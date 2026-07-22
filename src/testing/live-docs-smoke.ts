/**
 * Live smoke test for the docs tools against the real docs.tago.io site.
 * Run with `pnpm run test:docs:live`. Intentionally NOT part of vitest/CI:
 * it depends on the live docs site being reachable.
 */
import { platformOverviewConfigJSON } from "../services/docs/tools/platform-overview";
import { readDocConfigJSON } from "../services/docs/tools/read-doc";
import { searchDocsConfigJSON } from "../services/docs/tools/search-docs";
import { makeTestContext } from "./context";

const DEVICE_TOKEN_PATH = "/docs/tagoio/devices/device-token.md";

let failures = 0;

function report(name: string, passed: boolean, detail?: string) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
  if (!passed) {
    failures += 1;
  }
}

async function check(name: string, run: () => Promise<boolean>) {
  try {
    report(name, await run());
  } catch (error) {
    report(name, false, (error as Error)?.message || String(error));
  }
}

async function main() {
  const context = makeTestContext();

  await check("search_docs finds the device token page", async () => {
    const result = await searchDocsConfigJSON.tool(context, { query: "device token" });
    return result.includes(DEVICE_TOKEN_PATH);
  });

  await check("search_docs returns a controlled no-match message", async () => {
    const result = await searchDocsConfigJSON.tool(context, { query: "xyzzy frobnicate quux" });
    return result.includes("No documentation pages matched");
  });

  await check("read_doc returns the device token page with a Source line", async () => {
    const result = await readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH });
    return result.startsWith(`Source: https://docs.tago.io${DEVICE_TOKEN_PATH}`) && result.includes("# Device Token");
  });

  await check("read_doc rejects a path missing from the index", async () => {
    try {
      await readDocConfigJSON.tool(context, { path: "/docs/tagoio/not-a-real-page.md" });
      return false;
    } catch (error) {
      return ((error as Error)?.message || "").includes("search_docs");
    }
  });

  await check("platform_overview returns the static concept map", async () => {
    const result = await platformOverviewConfigJSON.tool(context, {});
    return result.includes("Five decision traps");
  });

  if (failures > 0) {
    console.error(`${failures} smoke check(s) failed`);
    process.exit(1);
  }
  console.log("all live docs smoke checks passed");
}

main().catch((error) => {
  console.error(`FAIL unexpected error - ${(error as Error)?.message || error}`);
  process.exit(1);
});
