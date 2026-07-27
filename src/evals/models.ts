import { TOOL_PREDICTION_CASES } from "./cases";

/** Owner-gated provider evals on a budget-capped OpenRouter key; CI never holds the key on regular runs. Offline (default): provider suites skip. EVAL_REQUIRE_PROVIDER=1: a missing key, empty model list, or empty case inventory fails the run instead of green-skipping. */
const DEFAULT_TARGET_MODELS = ["x-ai/grok-4.5", "openai/gpt-5.6-luna"];
const DEFAULT_JUDGE_MODEL = "x-ai/grok-4.5";

/** OpenRouter provider options applied to every target and judge call: reasoning at high effort. */
const EVAL_PROVIDER_OPTIONS = { openrouter: { reasoning: { effort: "high" } } } as const;

function getTargetModels(): string[] {
  const raw = process.env.EVAL_TARGET_MODELS;
  if (!raw) {
    return DEFAULT_TARGET_MODELS;
  }
  const models = raw
    .split(",")
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
  return models.length > 0 ? models : DEFAULT_TARGET_MODELS;
}

function getJudgeModel(): string {
  return process.env.EVAL_JUDGE_MODEL || DEFAULT_JUDGE_MODEL;
}

function isProviderEvalRequired(): boolean {
  const flag = (process.env.EVAL_REQUIRE_PROVIDER ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true";
}

function hasProviderKey(): boolean {
  const key = process.env.OPENROUTER_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

function assertProviderEvalMode(): void {
  if (!isProviderEvalRequired()) {
    return;
  }
  if (!hasProviderKey()) {
    throw new Error(
      "EVAL_REQUIRE_PROVIDER is set but OPENROUTER_API_KEY is missing or blank; refusing to skip provider evals (fail-closed). Provide the key or run test:evals:offline."
    );
  }
  if (getTargetModels().length === 0) {
    throw new Error("EVAL_REQUIRE_PROVIDER is set but the resolved target model list is empty.");
  }
  if (TOOL_PREDICTION_CASES.length === 0) {
    throw new Error("EVAL_REQUIRE_PROVIDER is set but TOOL_PREDICTION_CASES is empty; nothing would be evaluated.");
  }
}

function shouldSkipProviderEvals(): boolean {
  if (isProviderEvalRequired()) {
    assertProviderEvalMode();
    return false;
  }
  return !hasProviderKey();
}

export {
  DEFAULT_JUDGE_MODEL,
  DEFAULT_TARGET_MODELS,
  EVAL_PROVIDER_OPTIONS,
  assertProviderEvalMode,
  getJudgeModel,
  getTargetModels,
  isProviderEvalRequired,
  shouldSkipProviderEvals,
};
