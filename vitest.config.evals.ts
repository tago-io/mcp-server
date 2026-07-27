import { defineConfig } from "vitest/config";

/**
 * Provider-backed LLM eval lane. Separate from the default config so regular
 * `pnpm test` never touches it. Without OPENROUTER_API_KEY every suite skips,
 * except in required-provider mode (EVAL_REQUIRE_PROVIDER=1, set by
 * `pnpm run test:evals`) where a missing key fails the run instead.
 */
export default defineConfig({
  test: {
    globals: true,
    root: "./src",
    include: ["evals/**/*.eval.ts"],
    testTimeout: 120_000,
  },
});
