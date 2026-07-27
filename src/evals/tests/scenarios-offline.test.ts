import { describe, expect, it } from "vitest";

import { toolCatalog } from "../../services/catalog";
import { NormalizedCall } from "../oracle";
import { WORKFLOW_SCENARIOS, WorkflowScenario, checkWorkflowScenario } from "../scenarios";

const scenariosById = new Map(WORKFLOW_SCENARIOS.map((scenario) => [scenario.id, scenario]));

function getScenario(id: string): WorkflowScenario {
  const scenario = scenariosById.get(id);
  expect(scenario, `unknown scenario ${id}`).toBeDefined();
  return scenario as WorkflowScenario;
}

describe("workflow scenario inventory", () => {
  it("contains the four regression scenarios with unique IDs", () => {
    const ids = WORKFLOW_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const required of ["workflow-devices-concise-tags-01", "workflow-snippets-honesty-01", "workflow-widget-validate-01", "workflow-widget-nested-update-01"]) {
      expect(ids).toContain(required);
    }
  });

  it("pins only tools and top-level argument keys that exist in the catalog", () => {
    const schemaKeysByTool = new Map(toolCatalog.map((tool) => [tool.name, new Set(Object.keys(tool.parameters))]));
    for (const scenario of WORKFLOW_SCENARIOS) {
      for (const expected of scenario.expectedCalls) {
        const schemaKeys = schemaKeysByTool.get(expected.tool);
        expect(schemaKeys, `scenario ${scenario.id} pins unknown tool ${expected.tool}`).toBeDefined();
        for (const key of Object.keys(expected.arguments ?? {})) {
          expect(schemaKeys?.has(key), `scenario ${scenario.id} pins key "${key}" not in ${expected.tool}'s schema`).toBe(true);
        }
        for (const path of Object.keys(expected.arrayIncludes ?? {})) {
          expect(schemaKeys?.has(path.split(".")[0]), `scenario ${scenario.id} pins array path "${path}" not rooted in ${expected.tool}'s schema`).toBe(true);
        }
      }
      for (const forbidden of scenario.forbiddenTools ?? []) {
        expect(schemaKeysByTool.has(forbidden), `scenario ${scenario.id} forbids unknown tool ${forbidden}`).toBe(true);
      }
    }
  });

  it("contains no dynamic content in frozen prompts", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const scenario of WORKFLOW_SCENARIOS) {
      expect(scenario.prompt.includes("${")).toBe(false);
      expect(scenario.prompt.includes(today)).toBe(false);
    }
  });
});

describe("concise devices with tags scenario", () => {
  const scenario = getScenario("workflow-devices-concise-tags-01");
  const goodCall: NormalizedCall = {
    name: "search_devices",
    arguments: { amount: 5, response_format: "concise", fields: ["id", "name", "tags"] },
  };

  it("passes a concise search that selects tags", () => {
    expect(checkWorkflowScenario(scenario, [goodCall], "No matching devices were found.")).toEqual([]);
  });

  it("fails when tags is omitted from fields or fields is absent", () => {
    expect(checkWorkflowScenario(scenario, [{ name: "search_devices", arguments: { amount: 5, response_format: "concise", fields: ["id", "name"] } }], "done")).not.toEqual([]);
    expect(checkWorkflowScenario(scenario, [{ name: "search_devices", arguments: { amount: 5, response_format: "concise" } }], "done")).not.toEqual([]);
  });

  it("fails when amount or concise mode is wrong", () => {
    expect(checkWorkflowScenario(scenario, [{ name: "search_devices", arguments: { amount: 10, response_format: "concise", fields: ["tags"] } }], "done")).not.toEqual([]);
    expect(checkWorkflowScenario(scenario, [{ name: "search_devices", arguments: { amount: 5, response_format: "detailed", fields: ["tags"] } }], "done")).not.toEqual([]);
  });
});

describe("snippets honesty scenario", () => {
  const scenario = getScenario("workflow-snippets-honesty-01");
  const searchCall: NormalizedCall = {
    name: "search_code_examples",
    arguments: { query: "read device data", type: "analysis", runtime: "node-rt2025" },
  };

  it("passes an honest answer after the pinned runtime-scoped search", () => {
    const answer = "No node-rt2025 example covers reading device data exactly; I could not confirm the HTTP route from the examples.";
    expect(checkWorkflowScenario(scenario, [searchCall], answer)).toEqual([]);
  });

  it("fails an answer teaching the invented /data/:device_id route", () => {
    expect(checkWorkflowScenario(scenario, [searchCall], "You read data with GET /data/:device_id on the API.")).not.toEqual([]);
    expect(checkWorkflowScenario(scenario, [searchCall], "Use GET https://api.tago.io/data/{device_id} to fetch readings.")).not.toEqual([]);
    expect(checkWorkflowScenario(scenario, [searchCall], "Fetch /data/61f0000000000000000d0001 to read the data.")).not.toEqual([]);
  });

  it("fails when the search is not scoped to the node-rt2025 runtime", () => {
    expect(checkWorkflowScenario(scenario, [{ name: "search_code_examples", arguments: { query: "read device data", type: "analysis" } }], "honest answer")).not.toEqual([]);
  });
});

describe("widget schema-then-validate scenario", () => {
  const scenario = getScenario("workflow-widget-validate-01");
  const lookupCall: NormalizedCall = { name: "widget_schema_lookup", arguments: { type: "gauge" } };
  const validateCall: NormalizedCall = {
    name: "validate_widget_configuration",
    arguments: { configuration: { type: "gauge", label: "Tank Level", display: { gauge_type: "solid", numberformat: "0", minimum: 0, maximum: 100 } } },
  };

  it("passes lookup followed by validate with no create", () => {
    expect(checkWorkflowScenario(scenario, [lookupCall, validateCall], "The candidate configuration is valid.")).toEqual([]);
  });

  it("fails when the order is reversed", () => {
    expect(checkWorkflowScenario(scenario, [validateCall, lookupCall], "valid")).not.toEqual([]);
  });

  it("fails when either pinned call is missing", () => {
    expect(checkWorkflowScenario(scenario, [lookupCall], "valid")).not.toEqual([]);
    expect(checkWorkflowScenario(scenario, [validateCall], "valid")).not.toEqual([]);
  });

  it("fails when create_widget is called, even alongside the correct sequence", () => {
    const createCall: NormalizedCall = {
      name: "create_widget",
      arguments: { dashboard_id: "61f0000000000000000da001", configuration: { type: "gauge", label: "Tank Level" } },
    };
    const failures = checkWorkflowScenario(scenario, [lookupCall, validateCall, createCall], "valid, and I created it");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("create_widget");
  });
});

describe("nested widget update scenario", () => {
  const scenario = getScenario("workflow-widget-nested-update-01");
  const ids = { dashboard_id: "61f0000000000000000da001", widget_id: "61f0000000000000000db001" };

  it("passes a compact nested patch, with or without a preceding read", () => {
    const updateCall: NormalizedCall = { name: "update_widget", arguments: { ...ids, patch: { display: { numberformat: "0.00" } } } };
    expect(checkWorkflowScenario(scenario, [updateCall], "Updated the number format.")).toEqual([]);
    expect(checkWorkflowScenario(scenario, [{ name: "get_widget", arguments: ids }, updateCall], "Updated the number format.")).toEqual([]);
  });

  it("fails when the patch misses the nested display path or targets the wrong widget", () => {
    expect(checkWorkflowScenario(scenario, [{ name: "update_widget", arguments: { ...ids, patch: { numberformat: "0.00" } } }], "done")).not.toEqual([]);
    expect(checkWorkflowScenario(scenario, [{ name: "update_widget", arguments: { ...ids, patch: { display: { numberformat: "0" } } } }], "done")).not.toEqual([]);
    expect(
      checkWorkflowScenario(
        scenario,
        [{ name: "update_widget", arguments: { ...ids, widget_id: "61f0000000000000000db002", patch: { display: { numberformat: "0.00" } } } }],
        "done"
      )
    ).not.toEqual([]);
  });

  it("fails when no update_widget call is made", () => {
    expect(checkWorkflowScenario(scenario, [{ name: "get_widget", arguments: ids }], "done")).not.toEqual([]);
  });
});
