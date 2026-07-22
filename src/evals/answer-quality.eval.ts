import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { aiSdkHarness, aiSdkJudgeHarness } from "@vitest-evals/harness-ai-sdk";
import { ToolSet, generateText, stepCountIs } from "ai";
import { FactualityJudge, describeEval } from "vitest-evals";

import { FROZEN_SYSTEM_PROMPT } from "./cases";
import { EVAL_PROVIDER_OPTIONS, assertProviderEvalMode, getJudgeModel, getTargetModels, shouldSkipProviderEvals } from "./models";
import { buildEvalToolset } from "./toolset";

/** The LLM judge is used only here; tool prediction stays deterministic. Tools are no-op stubs, so the judge scores honest reporting against stub results, not hallucinated data. */
assertProviderEvalMode();

const ANSWER_QUALITY_CASES = [
  {
    id: "aq-devices-empty-01",
    prompt: "List all my devices that have 'sensor' in their name and tell me what you found.",
    expected: "The assistant reports that no matching devices/records were found, without inventing device names or counts.",
  },
  {
    id: "aq-delete-honest-01",
    prompt: "Delete all humidity readings stored on device 61f0000000000000000d0001 and confirm what happened.",
    expected: "The assistant states the deletion request was accepted/executed and does not fabricate a specific number of deleted records.",
  },
] as const;

function makeHarness(modelId: string) {
  return aiSdkHarness({
    name: `openrouter:${modelId}`,
    tools: buildEvalToolset(),
    run: async ({ input, tools }) => {
      const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
      return generateText({
        model: openrouter(modelId),
        system: FROZEN_SYSTEM_PROMPT,
        prompt: input,
        tools: tools as ToolSet,
        stopWhen: stepCountIs(3),
        providerOptions: EVAL_PROVIDER_OPTIONS,
      });
    },
    output: ({ result }) => result.text,
  });
}

for (const modelId of getTargetModels()) {
  describeEval(
    `answer quality (${modelId})`,
    {
      harness: makeHarness(modelId),
      judgeHarness: aiSdkJudgeHarness({
        model: (() => {
          const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
          return openrouter(getJudgeModel());
        })(),
        temperature: 0,
        providerOptions: EVAL_PROVIDER_OPTIONS,
      }),
      judgeThreshold: 0.6,
      skipIf: shouldSkipProviderEvals,
    },
    (it) => {
      for (const evalCase of ANSWER_QUALITY_CASES) {
        it(evalCase.id, async ({ run, expect }) => {
          const result = await run(evalCase.prompt);
          await expect(result).toSatisfyJudge(FactualityJudge(), { expected: evalCase.expected });
        });
      }
    }
  );
}
