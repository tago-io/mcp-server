/**
 * Live smoke test for the snippets backend against the real snippets.tago.io
 * catalog. Run with `pnpm run test:snippets:live`. Intentionally NOT part of
 * vitest/CI: it depends on the live catalog being reachable. Zero-secret and
 * non-mutating: the catalog is public and only GETs are issued.
 */
import { fetchSnippetIndex, fetchSnippetSource } from "../services/documentation/snippets-backend";

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
  await check("analysis node-rt2025 index has well-shaped entries", async () => {
    const entries = await fetchSnippetIndex("analysis", "node-rt2025");
    return entries.length > 0 && entries.every((entry) => entry.title.length > 0 && entry.filename.length > 0 && entry.file_path.length > 0);
  });

  await check("first indexed node-rt2025 file downloads as non-empty source", async () => {
    const entries = await fetchSnippetIndex("analysis", "node-rt2025");
    const source = await fetchSnippetSource("analysis", entries[0].file_path);
    return source.trim().length > 0;
  });

  await check("payload-parser javascript index has well-shaped entries", async () => {
    const entries = await fetchSnippetIndex("payload-parser");
    return entries.length > 0 && entries.every((entry) => entry.title.length > 0 && entry.filename.length > 0 && entry.file_path.length > 0);
  });

  await check("first indexed payload-parser file downloads as non-empty source", async () => {
    const entries = await fetchSnippetIndex("payload-parser");
    const source = await fetchSnippetSource("payload-parser", entries[0].file_path);
    return source.trim().length > 0;
  });

  if (failures > 0) {
    console.error(`${failures} smoke check(s) failed`);
    process.exit(1);
  }
  console.log("all live snippets smoke checks passed");
}

main().catch((error) => {
  console.error(`FAIL unexpected error - ${(error as Error)?.message || error}`);
  process.exit(1);
});
