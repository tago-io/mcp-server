# src/evals

Offline and provider-backed evals for tool-prediction and multi-step scenario conformance. The oracle (`oracle.ts`) is a v4 tool-name to semantic-operation map (`NEW_TOOL_MAP`); cases are built by the `createTestCases` factory in `cases.ts`.

## Freeze discipline

The datasets are frozen. The freeze takes effect at the first provider baseline run; after that, never edit existing entries, only add new IDs.

- Case IDs are stable: never reuse or renumber.
- `cases.ts` prompts, its `FROZEN_SYSTEM_PROMPT`, and the env-pinned model IDs are all part of the freeze.
- `scenarios.ts` multi-step scenarios follow the same freeze discipline.

## Models

Target models default to `x-ai/grok-4.5` and `openai/gpt-5.6-luna`; the judge is `x-ai/grok-4.5` (`models.ts`). Every target and judge call runs with OpenRouter reasoning at high effort.

## Offline vs provider gating

Provider evals are owner-gated on a budget-capped OpenRouter key; CI never holds the key on regular runs.

- Offline (default): provider suites skip.
- `EVAL_REQUIRE_PROVIDER=1`: a missing key, empty model list, or empty case inventory fails the run instead of green-skipping.

## Commands

```bash
# Offline verification, no provider key needed.
pnpm run test:evals:offline

# Owner-gated provider run (never from regular development).
pnpm run test:evals
```
