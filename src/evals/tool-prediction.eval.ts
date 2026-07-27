import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { aiSdkHarness } from "@vitest-evals/harness-ai-sdk";
import { ToolSet, generateText } from "ai";
import { expect } from "vitest";
import { describeEval, toolCalls } from "vitest-evals";

import { FROZEN_SYSTEM_PROMPT, TOOL_PREDICTION_CASES, checkToolPrediction } from "./cases";
import { EVAL_PROVIDER_OPTIONS, assertProviderEvalMode, getTargetModels, shouldSkipProviderEvals } from "./models";
import { normalizeToolCall } from "./oracle";
import { buildEvalToolset } from "./toolset";

/** Migration conformance suite: single-call prompts checked by checkToolPrediction, plus the oracle-normalized operation so comparative analysis shares the dataset. Provider-backed (owner-gated OPENROUTER_API_KEY); not part of regular CI. */
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
        providerOptions: EVAL_PROVIDER_OPTIONS,
      });
    },
    output: ({ result }) => result.text,
  });
}

for (const modelId of getTargetModels()) {
  describeEval(
    `tool prediction (${modelId})`,
    {
      harness: makeHarness(modelId),
      skipIf: shouldSkipProviderEvals,
    },
    (it) => {
      for (const evalCase of TOOL_PREDICTION_CASES) {
        it(evalCase.id, async ({ run }) => {
          const result = await run(evalCase.prompt);
          const calls = toolCalls(result).map((call) => ({ name: call.name, arguments: call.arguments as Record<string, unknown> }));
          const failures = checkToolPrediction(evalCase, calls);
          expect(failures, failures.join("\n")).toEqual([]);

          const semanticOperations = calls.map((call) => normalizeToolCall(call)).filter((operation) => operation !== undefined);
          expect(semanticOperations).toContain(evalCase.expectedOperation);
        });
      }
    }
  );
}
