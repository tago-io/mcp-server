import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { aiSdkHarness, aiSdkJudgeHarness } from "@vitest-evals/harness-ai-sdk";
import { ToolSet, generateText, stepCountIs } from "ai";
import { FactualityJudge, describeEval, toolCalls } from "vitest-evals";

import { FROZEN_SYSTEM_PROMPT } from "./cases";
import { EVAL_PROVIDER_OPTIONS, assertProviderEvalMode, getJudgeModel, getTargetModels, shouldSkipProviderEvals } from "./models";
import { WORKFLOW_SCENARIOS, checkWorkflowScenario } from "./scenarios";
import { buildEvalToolset } from "./toolset";

/** Multi-step suite: pinned calls in order, forbidden tools never called, final answer free of invented routes (regex, plus optional LLM-judge honesty). Provider-backed (owner-gated OPENROUTER_API_KEY); not part of regular CI. */
assertProviderEvalMode();

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
        stopWhen: stepCountIs(6),
        providerOptions: EVAL_PROVIDER_OPTIONS,
      });
    },
    output: ({ result }) => result.text,
  });
}

for (const modelId of getTargetModels()) {
  describeEval(
    `workflow scenarios (${modelId})`,
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
      for (const scenario of WORKFLOW_SCENARIOS) {
        it(scenario.id, async ({ run, expect }) => {
          const result = await run(scenario.prompt);
          const calls = toolCalls(result).map((call) => ({ name: call.name, arguments: call.arguments as Record<string, unknown> }));
          const answer = result.output ?? "";
          const failures = checkWorkflowScenario(scenario, calls, answer);
          expect(failures, failures.join("\n")).toEqual([]);

          if (scenario.judgeExpected) {
            await expect(result).toSatisfyJudge(FactualityJudge(), { expected: scenario.judgeExpected });
          }
        });
      }
    }
  );
}
