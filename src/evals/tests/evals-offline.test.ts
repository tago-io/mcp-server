import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { toolCatalog } from "../../services/catalog";
import { EvalCase, FROZEN_SYSTEM_PROMPT, TOOL_PREDICTION_CASES, checkToolPrediction, matchArgumentSubset } from "../cases";
import { DEFAULT_TARGET_MODELS, assertProviderEvalMode, getJudgeModel, getTargetModels, shouldSkipProviderEvals } from "../models";
import { NEW_TOOL_MAP, normalizeToolCall } from "../oracle";
import { NO_OP_RESULTS, buildEvalToolset } from "../toolset";

/** Runs on every PR with no provider; OPENROUTER_API_KEY must never be required here. */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("eval toolset derivation", () => {
  it("derives one AI SDK tool per catalog entry, no second schema inventory", () => {
    const toolset = buildEvalToolset();
    expect(Object.keys(toolset).sort()).toEqual(toolCatalog.map((tool) => tool.name).sort());
  });

  it("keeps descriptions identical to the catalog", () => {
    const toolset = buildEvalToolset();
    for (const config of toolCatalog) {
      expect(toolset[config.name].description).toBe(config.description);
    }
  });

  it("executes as a deterministic no-op without touching the network", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("eval no-op tools must not perform network requests");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const toolset = buildEvalToolset();
    for (const config of toolCatalog) {
      const execute = toolset[config.name].execute;
      expect(execute, `tool ${config.name} has no execute`).toBeDefined();
      const result = await execute?.({} as never, { toolCallId: "t", messages: [] } as never);
      expect(result).toBe(NO_OP_RESULTS[config.mutationClass]);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("semantic oracle", () => {
  it("maps every target tool name to a semantic operation", () => {
    for (const [name, operation] of Object.entries(NEW_TOOL_MAP)) {
      expect(normalizeToolCall({ name })).toBe(operation);
    }
  });

  it("returns no operations for unknown tools", () => {
    expect(normalizeToolCall({ name: "not-a-tool" })).toBeUndefined();
  });
});

describe("argument matcher", () => {
  const rotationCase: EvalCase = {
    id: "matcher-fixture-01",
    prompt: "n/a",
    expectedTool: "update_device",
    expectedOperation: "devices.update",
    expectedArguments: { device_id: "61f0000000000000000d0001", serie_number: "A81758FFFE03AB01", confirm_token_rotation: true },
  };

  it("passes on a deep subset with extra received keys", () => {
    const mismatches = matchArgumentSubset(
      { device_id: "61f0000000000000000d0001", data: [{ id: "61f0000000000000000dd001", unit: "°F" }] },
      { device_id: "61f0000000000000000d0001", data: [{ id: "61f0000000000000000dd001", unit: "°F", value: 77 }], response_format: "concise" }
    );
    expect(mismatches).toEqual([]);
  });

  it("fails a wrong resource ID with expected vs received in the message", () => {
    const mismatches = matchArgumentSubset({ device_id: "61f0000000000000000d0001" }, { device_id: "61f0000000000000000d0002" });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toContain("61f0000000000000000d0001");
    expect(mismatches[0]).toContain("61f0000000000000000d0002");
  });

  it("fails when a pinned confirmation flag is missing", () => {
    const failures = checkToolPrediction(rotationCase, [{ name: "update_device", arguments: { device_id: "61f0000000000000000d0001", serie_number: "A81758FFFE03AB01" } }]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("confirm_token_rotation");
    expect(failures[0]).toContain("key missing");
  });

  it("fails array pins that differ in length or content", () => {
    expect(matchArgumentSubset({ variables: ["humidity"] }, { variables: ["humidity", "temperature"] })).toHaveLength(1);
    expect(matchArgumentSubset({ variables: ["humidity"] }, { variables: ["temperature"] })).toHaveLength(1);
    expect(matchArgumentSubset({ variables: ["humidity"] }, { variables: ["humidity"] })).toEqual([]);
  });

  it("fails the exactly-one rule when the expected call is accompanied by an unrelated destructive call", () => {
    const failures = checkToolPrediction(rotationCase, [
      { name: "update_device", arguments: { device_id: "61f0000000000000000d0001", serie_number: "A81758FFFE03AB01", confirm_token_rotation: true } },
      { name: "delete_device", arguments: { device_id: "61f0000000000000000d0001" } },
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("exactly one tool call");
    expect(failures[0]).toContain("delete_device");
  });

  it("fails when no call or the wrong tool is made", () => {
    expect(checkToolPrediction(rotationCase, [])[0]).toContain("received 0");
    const wrongTool = checkToolPrediction(rotationCase, [{ name: "delete_device", arguments: {} }]);
    expect(wrongTool[0]).toContain("expected tool update_device");
    expect(wrongTool[0]).toContain("delete_device");
  });

  it("passes a fully conforming single call", () => {
    expect(
      checkToolPrediction(rotationCase, [
        { name: "update_device", arguments: { device_id: "61f0000000000000000d0001", serie_number: "A81758FFFE03AB01", confirm_token_rotation: true, name: "x" } },
      ])
    ).toEqual([]);
  });
});

describe("pinned prompt-fixed arguments", () => {
  const casesById = new Map(TOOL_PREDICTION_CASES.map((evalCase) => [evalCase.id, evalCase]));

  function checkCase(id: string, args: Record<string, unknown>): string[] {
    const evalCase = casesById.get(id);
    expect(evalCase, `unknown case ${id}`).toBeDefined();
    return checkToolPrediction(evalCase as EvalCase, [{ name: (evalCase as EvalCase).expectedTool, arguments: args }]);
  }

  it("rejects an immutable (or defaulted) storage type on the mutable-create case", () => {
    const base = { name: "Warehouse Tracker", connector: "61f0000000000000000c0001" };
    expect(checkCase("devices-create-01", { ...base, type: "immutable" })).not.toEqual([]);
    expect(checkCase("devices-create-01", base)).not.toEqual([]);
    expect(checkCase("devices-create-01", { ...base, type: "mutable" })).toEqual([]);
  });

  it("rejects a fields selection omitting tags on the concise-tags listing case", () => {
    const base = { amount: 5, response_format: "concise" };
    expect(checkCase("devices-search-02", { ...base, fields: ["id", "name"] })).not.toEqual([]);
    expect(checkCase("devices-search-02", base)).not.toEqual([]);
    expect(checkCase("devices-search-02", { ...base, fields: ["tags", "name", "id"] })).toEqual([]);
    expect(checkCase("devices-search-02", { ...base, fields: ["id", "name", "tags", "type"] })).toEqual([]);
  });

  it("rejects conditional and default queries on the June-average case", () => {
    const base = {
      device_id: "61f0000000000000000d0001",
      variables: ["temperature"],
      start_date: "2026-06-01T00:00:00Z",
      end_date: "2026-06-30T23:59:59Z",
    };
    expect(checkCase("device-data-read-01", { ...base, query: "conditional", value: 25, function: "gt" })).not.toEqual([]);
    expect(checkCase("device-data-read-01", base)).not.toEqual([]);
    expect(checkCase("device-data-read-01", { ...base, query: "avg" })).toEqual([]);
  });

  it("rejects a resource trigger on the fifteen-minute interval case", () => {
    const action = { type: "script", script: ["61f00000000000000000b001"] };
    const resourceCall = {
      name: "Run analysis",
      type: "resource",
      action,
      trigger: [{ resource: "device", when: "create", tag_key: "device_type", tag_value: "sensor" }],
    };
    expect(checkCase("actions-create-01", resourceCall)).not.toEqual([]);
    expect(checkCase("actions-create-01", { name: "Run analysis", type: "interval", action, trigger: [{ interval: "15 minutes" }] })).toEqual([]);
  });

  it("rejects unfiltered calls on every prompt-filtered search case", () => {
    for (const id of [
      "analyses-search-01",
      "run-users-search-01",
      "connectors-search-01",
      "networks-search-01",
      "docs-search-01",
      "code-examples-search-01",
      "actions-search-01",
    ]) {
      expect(checkCase(id, {}), id).not.toEqual([]);
    }
  });

  it("rejects wrong uploaded source and accepts the exact prompt-fixed source", () => {
    const base = { analysis_id: "61f00000000000000000b001", filename: "main.js" };
    expect(checkCase("analyses-upload-01", { ...base, source: "console.log('goodbye')" })).not.toEqual([]);
    expect(checkCase("analyses-upload-01", base)).not.toEqual([]);
    expect(checkCase("analyses-upload-01", { ...base, source: "console.log('hello')" })).toEqual([]);
  });

  it("rejects wrong widget type or label and accepts the pinned gauge with extra display fields", () => {
    const base = { dashboard_id: "61f0000000000000000da001" };
    expect(checkCase("widgets-create-01", { ...base, configuration: { type: "card", label: "Tank Level", display: {} } })).not.toEqual([]);
    expect(checkCase("widgets-create-01", { ...base, configuration: { type: "gauge", label: "Fuel Level", display: {} } })).not.toEqual([]);
    expect(checkCase("widgets-create-01", base)).not.toEqual([]);
    expect(
      checkCase("widgets-create-01", {
        ...base,
        configuration: { type: "gauge", label: "Tank Level", display: { gauge_type: "solid", numberformat: "0", minimum: 0, maximum: 100 } },
      })
    ).toEqual([]);
  });

  it("keeps the exactly-one-call rule on the newly pinned cases", () => {
    const uploadCase = casesById.get("analyses-upload-01") as EvalCase;
    const goodCall = {
      name: "upload_analysis_script",
      arguments: { analysis_id: "61f00000000000000000b001", filename: "main.js", source: "console.log('hello')" },
    };
    expect(checkToolPrediction(uploadCase, [goodCall, { name: "run_analysis", arguments: { analysis_id: "61f00000000000000000b001" } }])).not.toEqual([]);
    expect(checkToolPrediction(uploadCase, [goodCall])).toEqual([]);
  });

  it("accepts the corrected canonical call for each rewritten search case", () => {
    const canonical: Array<[string, Record<string, unknown>]> = [
      ["analyses-search-01", { filter: { name: "invoice" } }],
      ["run-users-search-01", { filter: { email: "gmail" } }],
      ["connectors-search-01", { name: "LoRaWAN" }],
      ["networks-search-01", { name: "MQTT", public: true }],
      ["docs-search-01", { query: "device tokens" }],
      ["code-examples-search-01", { query: "how to create a device", type: "analysis" }],
      ["actions-search-01", { response_format: "detailed" }],
    ];
    for (const [id, args] of canonical) {
      expect(checkCase(id, args), id).toEqual([]);
    }
  });
});

describe("frozen case inventory", () => {
  it("covers every target tool at least once", () => {
    const expectedTools = new Set(TOOL_PREDICTION_CASES.map((evalCase) => evalCase.expectedTool));
    expect([...expectedTools].sort()).toEqual(Object.keys(NEW_TOOL_MAP).sort());
  });

  it("keeps case IDs unique and expected operations consistent with the oracle", () => {
    const ids = TOOL_PREDICTION_CASES.map((evalCase) => evalCase.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const evalCase of TOOL_PREDICTION_CASES) {
      expect(normalizeToolCall({ name: evalCase.expectedTool }), `case ${evalCase.id}`).toBe(evalCase.expectedOperation);
    }
  });

  it("pins only argument keys that exist in the target tool's schema", () => {
    const schemaKeysByTool = new Map(toolCatalog.map((tool) => [tool.name, new Set(Object.keys(tool.parameters))]));
    for (const evalCase of TOOL_PREDICTION_CASES) {
      if (!evalCase.expectedArguments) {
        continue;
      }
      const schemaKeys = schemaKeysByTool.get(evalCase.expectedTool);
      expect(schemaKeys, `case ${evalCase.id} targets unknown tool ${evalCase.expectedTool}`).toBeDefined();
      for (const key of Object.keys(evalCase.expectedArguments)) {
        expect(schemaKeys?.has(key), `case ${evalCase.id} pins key "${key}" not in ${evalCase.expectedTool}'s schema`).toBe(true);
      }
    }
  });

  it("keeps credential-rotation and network-choice coverage pinned in the dataset", () => {
    const rotationCases = TOOL_PREDICTION_CASES.filter((evalCase) => evalCase.expectedTool === "update_device" && evalCase.expectedArguments?.confirm_token_rotation === true);
    expect(rotationCases.length, "at least one update_device case must pin confirm_token_rotation: true").toBeGreaterThan(0);

    const createCases = TOOL_PREDICTION_CASES.filter((evalCase) => evalCase.expectedTool === "create_device" && evalCase.expectedArguments);
    expect(createCases.some((evalCase) => typeof evalCase.expectedArguments?.network === "string")).toBe(true);
    expect(createCases.some((evalCase) => evalCase.expectedArguments && !("network" in evalCase.expectedArguments))).toBe(true);
  });

  it("pins the target resource ID on every destructive-tool case", () => {
    const destructiveTools = new Set(toolCatalog.filter((tool) => tool.mutationClass === "destructive").map((tool) => tool.name));
    for (const evalCase of TOOL_PREDICTION_CASES) {
      if (!destructiveTools.has(evalCase.expectedTool)) {
        continue;
      }
      const pinnedId = Object.entries(evalCase.expectedArguments ?? {}).find(([key, value]) => key.endsWith("_id") && typeof value === "string" && value.length === 24);
      expect(pinnedId, `destructive case ${evalCase.id} must pin a 24-character resource ID`).toBeDefined();
    }
  });

  it("contains no dynamic content in frozen prompts", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const evalCase of TOOL_PREDICTION_CASES) {
      expect(evalCase.prompt.includes("${")).toBe(false);
      expect(evalCase.prompt.includes(today)).toBe(false);
    }
    expect(FROZEN_SYSTEM_PROMPT.includes("${")).toBe(false);
  });
});

describe("eval configuration", () => {
  it("discovers every eval suite via the evals vitest config include pattern", () => {
    const evalFiles = readdirSync(join(__dirname, "..")).filter((file) => file.endsWith(".eval.ts"));
    expect(evalFiles.sort()).toEqual(["answer-quality.eval.ts", "tool-prediction.eval.ts", "workflow-scenarios.eval.ts"]);
  });

  it("skips provider evals in offline mode when OPENROUTER_API_KEY is absent or blank", () => {
    vi.stubEnv("EVAL_REQUIRE_PROVIDER", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(shouldSkipProviderEvals()).toBe(true);
    vi.stubEnv("OPENROUTER_API_KEY", "   ");
    expect(shouldSkipProviderEvals()).toBe(true);
    vi.stubEnv("OPENROUTER_API_KEY", "sk-test");
    expect(shouldSkipProviderEvals()).toBe(false);
  });

  it("treats the offline gate as a no-op when EVAL_REQUIRE_PROVIDER is unset", () => {
    vi.stubEnv("EVAL_REQUIRE_PROVIDER", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(() => assertProviderEvalMode()).not.toThrow();
  });

  it("fails closed in required-provider mode when the key is missing or blank", () => {
    vi.stubEnv("EVAL_REQUIRE_PROVIDER", "1");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(() => assertProviderEvalMode()).toThrow(/OPENROUTER_API_KEY/);
    expect(() => shouldSkipProviderEvals()).toThrow(/OPENROUTER_API_KEY/);
    vi.stubEnv("OPENROUTER_API_KEY", "   ");
    expect(() => assertProviderEvalMode()).toThrow(/OPENROUTER_API_KEY/);
  });

  it("does not skip in required-provider mode when a key is present", () => {
    vi.stubEnv("EVAL_REQUIRE_PROVIDER", "1");
    vi.stubEnv("OPENROUTER_API_KEY", "sk-dummy");
    expect(() => assertProviderEvalMode()).not.toThrow();
    expect(shouldSkipProviderEvals()).toBe(false);
  });

  it("has a nonempty model list and case inventory to evaluate", () => {
    vi.stubEnv("EVAL_TARGET_MODELS", "");
    expect(getTargetModels().length).toBeGreaterThan(0);
    expect(TOOL_PREDICTION_CASES.length).toBeGreaterThan(0);
  });

  it("reads target and judge models from env with pinned defaults", () => {
    vi.stubEnv("EVAL_TARGET_MODELS", "");
    expect(getTargetModels()).toEqual(DEFAULT_TARGET_MODELS);

    vi.stubEnv("EVAL_TARGET_MODELS", "a/model-1, b/model-2");
    expect(getTargetModels()).toEqual(["a/model-1", "b/model-2"]);

    vi.stubEnv("EVAL_JUDGE_MODEL", "c/judge");
    expect(getJudgeModel()).toBe("c/judge");
  });
});
