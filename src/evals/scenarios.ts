import { collectPinMismatches } from "./cases";
import { NormalizedCall } from "./oracle";

/** FROZEN multi-step scenarios (same freeze discipline as cases.ts). A scenario checks a transcript: pinned calls must appear in order as a subsequence (unpinned calls allowed between them), forbidden tools never, and the final answer must match no forbidden pattern. */
interface ExpectedScenarioCall {
  tool: string;
  arguments?: Record<string, unknown>;
  arrayIncludes?: Record<string, unknown[]>;
}

interface WorkflowScenario {
  /** Stable scenario ID; never reuse or renumber. */
  id: string;
  prompt: string;
  expectedCalls: ExpectedScenarioCall[];
  forbiddenTools?: string[];
  /** Deterministic rejection of invented routes and specifics the no-op stubs cannot have provided. */
  forbiddenAnswerPatterns?: RegExp[];
  /** Optional LLM-judge criterion for honesty aspects regexes cannot pin. */
  judgeExpected?: string;
}

const WORKFLOW_SCENARIOS: WorkflowScenario[] = [
  {
    id: "workflow-devices-concise-tags-01",
    prompt: "Give me a concise listing of five of my devices, and make sure the listing includes each device's tags.",
    expectedCalls: [
      {
        tool: "search_devices",
        // Tags are outside the concise defaults, so the call must select them
        // explicitly via `fields` for the output to actually show them.
        arguments: { amount: 5, response_format: "concise" },
        arrayIncludes: { fields: ["tags"] },
      },
    ],
    judgeExpected: "The assistant reports that no matching devices were found, without inventing device names, tags, or counts.",
  },
  {
    id: "workflow-snippets-honesty-01",
    prompt:
      "Find a node-rt2025 analysis code example that shows how to read data from a device, and tell me exactly which HTTP route reading device data uses. If no example covers it exactly, say so plainly.",
    expectedCalls: [{ tool: "search_code_examples", arguments: { type: "analysis", runtime: "node-rt2025" } }],
    // The device-data read route is NOT /data/:device_id; the device is identified by its token, not a path segment. Teaching a device-id path under /data is an invented route.
    forbiddenAnswerPatterns: [/\/data\/:device_?id/i, /\/data\/\{device_?id\}/i, /\/data\/[0-9a-fA-F]{24}\b/, /GET\s+\/data\/:id\b/i],
    judgeExpected:
      "The assistant reports honestly what the search returned (no matching example in the stubbed results), does not invent an HTTP route for reading device data, and does not claim an exact example exists when none was found.",
  },
  {
    id: "workflow-widget-validate-01",
    prompt:
      'Look up the exact configuration schema for a gauge widget, then check, without creating anything, whether this candidate is valid: { "label": "Tank Level", "type": "gauge", "display": { "gauge_type": "solid", "numberformat": "0", "minimum": 0, "maximum": 100 } }.',
    expectedCalls: [
      { tool: "widget_schema_lookup", arguments: { type: "gauge" } },
      { tool: "validate_widget_configuration", arguments: { configuration: { type: "gauge", label: "Tank Level" } } },
    ],
    forbiddenTools: ["create_widget"],
  },
  {
    id: "workflow-widget-nested-update-01",
    prompt:
      "On dashboard 61f0000000000000000da001, change the number format of widget 61f0000000000000000db001's display to '0.00'. Change only that display property; leave every other display setting untouched.",
    expectedCalls: [
      {
        tool: "update_widget",
        // The patch merges recursively, so a compact nested patch is the correct call;
        // the subset matcher does not forbid resent siblings, but the nested path is pinned.
        arguments: {
          dashboard_id: "61f0000000000000000da001",
          widget_id: "61f0000000000000000db001",
          patch: { display: { numberformat: "0.00" } },
        },
      },
    ],
  },
];

function checkWorkflowScenario(scenario: WorkflowScenario, calls: NormalizedCall[], answer: string): string[] {
  const failures: string[] = [];

  for (const forbidden of scenario.forbiddenTools ?? []) {
    if (calls.some((call) => call.name === forbidden)) {
      failures.push(`forbidden tool ${forbidden} was called`);
    }
  }

  // Ordered subsequence match: each pinned call must be satisfied by a later
  // transcript call than the previous pin.
  let cursor = 0;
  for (const [index, expected] of scenario.expectedCalls.entries()) {
    let matched = false;
    while (cursor < calls.length) {
      const call = calls[cursor];
      cursor += 1;
      if (call.name !== expected.tool) {
        continue;
      }
      if (collectPinMismatches(call.arguments, expected.arguments, expected.arrayIncludes).length === 0) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      const names = calls.map((call) => `${call.name}(${JSON.stringify(call.arguments ?? {})})`).join(", ") || "none";
      failures.push(`expected call ${index + 1} (${expected.tool} matching ${JSON.stringify(expected.arguments ?? {})}) not found in order; transcript calls: [${names}]`);
    }
  }

  for (const pattern of scenario.forbiddenAnswerPatterns ?? []) {
    if (pattern.test(answer)) {
      failures.push(`answer matches forbidden pattern ${pattern}: invented route or unsupported claim`);
    }
  }

  return failures;
}

export { ExpectedScenarioCall, WORKFLOW_SCENARIOS, WorkflowScenario, checkWorkflowScenario };
