import { NEW_TOOL_MAP, NormalizedCall, SemanticOperation } from "./oracle";

/** FROZEN dataset: prompts, the system prompt below, and env-pinned model IDs back migration conformance. The freeze takes effect at the first provider baseline run; after that, never edit existing entries, add new IDs. */
const FROZEN_SYSTEM_PROMPT = `You are an assistant operating a TagoIO IoT account through tools. Use the available tools to fulfil the user's request. Prefer a single, precise tool call. Resource IDs in TagoIO are 24-character strings.`;

interface EvalCase {
  /** Stable case ID; never reuse or renumber. */
  id: string;
  prompt: string;
  expectedTool: string;
  expectedOperation: SemanticOperation;
  /** Deep subset the call's arguments must contain: pinned leaves compare strictly, extra received keys pass, arrays match in length with per-index subsets. Omit when the prompt leaves phrasing unconstrained. */
  expectedArguments?: Record<string, unknown>;
  /** Order-insensitive containment by dot path: the array must include every listed element, extras allowed. For parameters like fields where the prompt fixes members but not order. */
  expectedArrayIncludes?: Record<string, unknown[]>;
}

/** An EvalCase before the factory derives expectedOperation from expectedTool. */
type EvalCaseSpec = Omit<EvalCase, "expectedOperation">;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectArgumentMismatches(expected: unknown, received: unknown, path: string): string[] {
  if (Array.isArray(expected)) {
    if (!Array.isArray(received)) {
      return [`${path}: expected array ${JSON.stringify(expected)}, received ${JSON.stringify(received)}`];
    }
    if (received.length !== expected.length) {
      return [`${path}: expected ${expected.length} item(s) ${JSON.stringify(expected)}, received ${received.length} item(s) ${JSON.stringify(received)}`];
    }
    return expected.flatMap((item, index) => collectArgumentMismatches(item, received[index], `${path}[${index}]`));
  }

  if (isPlainObject(expected)) {
    if (!isPlainObject(received)) {
      return [`${path}: expected object ${JSON.stringify(expected)}, received ${JSON.stringify(received)}`];
    }
    const mismatches: string[] = [];
    for (const [key, value] of Object.entries(expected)) {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in received)) {
        mismatches.push(`${childPath}: expected ${JSON.stringify(value)}, key missing`);
        continue;
      }
      mismatches.push(...collectArgumentMismatches(value, received[key], childPath));
    }
    return mismatches;
  }

  return Object.is(expected, received) ? [] : [`${path}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(received)}`];
}

function matchArgumentSubset(expected: Record<string, unknown>, received: Record<string, unknown>): string[] {
  return collectArgumentMismatches(expected, received, "");
}

function resolvePath(received: Record<string, unknown>, path: string): unknown {
  let current: unknown = received;
  for (const segment of path.split(".")) {
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function matchArrayIncludes(pins: Record<string, unknown[]>, received: Record<string, unknown>): string[] {
  const mismatches: string[] = [];
  for (const [path, requiredElements] of Object.entries(pins)) {
    const value = resolvePath(received, path);
    if (!Array.isArray(value)) {
      mismatches.push(`${path}: expected an array including ${JSON.stringify(requiredElements)}, received ${JSON.stringify(value)}`);
      continue;
    }
    for (const element of requiredElements) {
      const present = value.some((candidate) => collectArgumentMismatches(element, candidate, "").length === 0);
      if (!present) {
        mismatches.push(`${path}: missing required element ${JSON.stringify(element)} in ${JSON.stringify(value)}`);
      }
    }
  }
  return mismatches;
}

/** Runs both pin matchers against one call's arguments, tolerating undefined arguments. Shared with the scenario checker. */
function collectPinMismatches(args: Record<string, unknown> | undefined, subset?: Record<string, unknown>, arrayIncludes?: Record<string, unknown[]>): string[] {
  const received = args ?? {};
  return [...(subset ? matchArgumentSubset(subset, received) : []), ...(arrayIncludes ? matchArrayIncludes(arrayIncludes, received) : [])];
}

function checkToolPrediction(evalCase: EvalCase, calls: NormalizedCall[]): string[] {
  if (calls.length !== 1) {
    const names = calls.map((call) => call.name).join(", ") || "none";
    return [`expected exactly one tool call (${evalCase.expectedTool}); received ${calls.length} call(s): [${names}]`];
  }

  const call = calls[0];
  if (call.name !== evalCase.expectedTool) {
    return [`expected tool ${evalCase.expectedTool}; received ${call.name}`];
  }

  const mismatches = collectPinMismatches(call.arguments, evalCase.expectedArguments, evalCase.expectedArrayIncludes);
  if (mismatches.length > 0) {
    return [`arguments for ${call.name} violate the pinned subset:\n  ${mismatches.join("\n  ")}\nreceived: ${JSON.stringify(call.arguments ?? {})}`];
  }

  return [];
}

const usedCaseIds = new Set<string>();

/** Stamps each spec with the operation derived from its expectedTool. Throws on a duplicate ID (across every domain) or an unknown tool so a mistyped case fails at load, not silently. */
function createTestCases(domain: string, specs: EvalCaseSpec[]): EvalCase[] {
  return specs.map((spec) => {
    if (usedCaseIds.has(spec.id)) {
      throw new Error(`Duplicate eval case ID "${spec.id}" (domain ${domain})`);
    }
    usedCaseIds.add(spec.id);
    if (!(spec.expectedTool in NEW_TOOL_MAP)) {
      throw new Error(`Eval case "${spec.id}" (domain ${domain}) targets unknown tool "${spec.expectedTool}"`);
    }
    return { ...spec, expectedOperation: NEW_TOOL_MAP[spec.expectedTool as keyof typeof NEW_TOOL_MAP] };
  });
}

const TOOL_PREDICTION_CASES: EvalCase[] = [
  ...createTestCases("devices", [
    {
      id: "devices-search-01",
      prompt: "List all my devices that have 'sensor' in their name.",
      expectedTool: "search_devices",
      expectedArguments: { filter: { name: "sensor" } },
    },
    {
      id: "devices-search-02",
      prompt: "Give me a concise listing of five of my devices showing their id, name, and tags.",
      expectedTool: "search_devices",
      // Tags are outside the concise defaults, so the call must select them
      // explicitly via `fields` for the output to actually show them.
      expectedArguments: { amount: 5, response_format: "concise" },
      expectedArrayIncludes: { fields: ["id", "name", "tags"] },
    },
    {
      id: "devices-get-01",
      prompt: "Show me the full details of device 61f0000000000000000d0001.",
      expectedTool: "get_device",
      expectedArguments: { device_id: "61f0000000000000000d0001" },
    },
    {
      id: "devices-create-01",
      prompt: "Create a new mutable device called 'Warehouse Tracker' using connector 61f0000000000000000c0001.",
      expectedTool: "create_device",
      expectedArguments: { name: "Warehouse Tracker", connector: "61f0000000000000000c0001", type: "mutable" },
    },
    {
      id: "devices-update-01",
      prompt: "Rename device 61f0000000000000000d0001 to 'Dock Sensor 2'.",
      expectedTool: "update_device",
      expectedArguments: { device_id: "61f0000000000000000d0001", name: "Dock Sensor 2" },
    },
    {
      id: "devices-delete-01",
      prompt: "Permanently delete the device 61f0000000000000000d0002.",
      expectedTool: "delete_device",
      expectedArguments: { device_id: "61f0000000000000000d0002" },
    },
    {
      id: "devices-configure-01",
      prompt: "On device 61f0000000000000000d0001, set the configuration parameter dashboard_url to https://admin.tago.io and mark it as sent.",
      expectedTool: "configure_device",
      expectedArguments: {
        device_id: "61f0000000000000000d0001",
        configuration_params: [{ key: "dashboard_url", value: "https://admin.tago.io", sent: true }],
      },
    },
  ]),
  ...createTestCases("device-data", [
    {
      id: "device-data-read-01",
      prompt: "What was the average temperature reported by device 61f0000000000000000d0001 between 2026-06-01T00:00:00Z and 2026-06-30T23:59:59Z? Use exactly that start and end.",
      expectedTool: "read_device_data",
      expectedArguments: {
        device_id: "61f0000000000000000d0001",
        query: "avg",
        variables: ["temperature"],
        start_date: "2026-06-01T00:00:00Z",
        end_date: "2026-06-30T23:59:59Z",
      },
    },
    {
      id: "device-data-send-01",
      prompt: "Store a temperature reading of 25.5 °C on device 61f0000000000000000d0001.",
      expectedTool: "send_device_data",
      expectedArguments: { device_id: "61f0000000000000000d0001", data: [{ variable: "temperature", value: 25.5 }] },
    },
    {
      id: "device-data-edit-01",
      prompt: "Change the unit of the existing data record 61f0000000000000000dd001 on device 61f0000000000000000d0001 from °C to °F.",
      expectedTool: "edit_device_data",
      expectedArguments: { device_id: "61f0000000000000000d0001", data: [{ id: "61f0000000000000000dd001", unit: "°F" }] },
    },
    {
      id: "device-data-delete-01",
      prompt: "Delete all humidity readings stored on device 61f0000000000000000d0001.",
      expectedTool: "delete_device_data",
      expectedArguments: { device_id: "61f0000000000000000d0001", variables: ["humidity"] },
    },
  ]),
  ...createTestCases("actions", [
    {
      id: "actions-search-01",
      prompt: "Which of my automations send emails? List my actions with their full action configuration so the answer can be checked.",
      expectedTool: "search_actions",
      // Concise output omits the action payload, so only a detailed listing can
      // establish which actions send email.
      expectedArguments: { response_format: "detailed" },
    },
    {
      id: "actions-get-01",
      prompt: "Show me the trigger configuration of action 61f0000000000000000a0001.",
      expectedTool: "get_action",
      expectedArguments: { action_id: "61f0000000000000000a0001" },
    },
    {
      id: "actions-create-01",
      prompt: "Create an automation that runs the analysis 61f00000000000000000b001 every 15 minutes.",
      expectedTool: "create_action",
      expectedArguments: {
        type: "interval",
        action: { type: "script", script: ["61f00000000000000000b001"] },
        trigger: [{ interval: "15 minutes" }],
      },
    },
    {
      id: "actions-update-01",
      prompt: "Deactivate the action 61f0000000000000000a0001 without deleting it.",
      expectedTool: "update_action",
      expectedArguments: { action_id: "61f0000000000000000a0001", active: false },
    },
    {
      id: "actions-delete-01",
      prompt: "Remove the action 61f0000000000000000a0001 from my account.",
      expectedTool: "delete_action",
      expectedArguments: { action_id: "61f0000000000000000a0001" },
    },
  ]),
  ...createTestCases("analyses", [
    {
      id: "analyses-search-01",
      prompt: "Find my analyses whose name contains 'invoice'.",
      expectedTool: "search_analyses",
      expectedArguments: { filter: { name: "invoice" } },
    },
    {
      id: "analyses-get-01",
      prompt: "Show the configuration of analysis 61f00000000000000000b001.",
      expectedTool: "get_analysis",
      expectedArguments: { analysis_id: "61f00000000000000000b001" },
    },
  ]),
  ...createTestCases("entities", [
    { id: "entities-search-01", prompt: "List the entities in my account.", expectedTool: "search_entities" },
    {
      id: "entities-get-01",
      prompt: "What is the schema of entity 61f0000000000000000f0001?",
      expectedTool: "get_entity",
      expectedArguments: { entity_id: "61f0000000000000000f0001" },
    },
  ]),
  ...createTestCases("run-users", [
    {
      id: "run-users-search-01",
      prompt: "Find TagoRUN users whose email contains 'gmail'.",
      expectedTool: "search_run_users",
      expectedArguments: { filter: { email: "gmail" } },
    },
    {
      id: "run-users-get-01",
      prompt: "Show me the run user 61f00000000000000c900001.",
      expectedTool: "get_run_user",
      expectedArguments: { run_user_id: "61f00000000000000c900001" },
    },
  ]),
  ...createTestCases("profile", [
    { id: "profile-get-01", prompt: "Which TagoIO profile am I currently using?", expectedTool: "get_profile" },
    { id: "profile-limits-01", prompt: "How much of my data input limit have I used?", expectedTool: "get_profile_limits" },
    {
      id: "profile-statistics-01",
      prompt: "Show my profile usage statistics for June 2026, day by day.",
      expectedTool: "get_profile_statistics",
      expectedArguments: { periodicity: "day" },
    },
  ]),
  ...createTestCases("secrets", [{ id: "secrets-search-01", prompt: "List the secrets configured in my profile.", expectedTool: "search_secrets" }]),
  ...createTestCases("connectors", [
    {
      id: "connectors-search-01",
      prompt: "Search the available connectors named 'LoRaWAN'.",
      expectedTool: "search_connectors",
      expectedArguments: { name: "LoRaWAN" },
    },
    {
      id: "connectors-get-01",
      prompt: "Show connector 61f0000000000000000c0001 and which networks it supports.",
      expectedTool: "get_connector",
      expectedArguments: { connector_id: "61f0000000000000000c0001" },
    },
  ]),
  ...createTestCases("networks", [
    {
      id: "networks-search-01",
      prompt: "Find the networks named 'MQTT' available to my profile, not the ones from TagoIO's public catalog.",
      expectedTool: "search_networks",
      expectedArguments: { name: "MQTT", exclude_public_catalog: true },
    },
    {
      id: "networks-get-01",
      prompt: "Show me the network 61f0000000000000000e0001.",
      expectedTool: "get_network",
      expectedArguments: { network_id: "61f0000000000000000e0001" },
    },
  ]),
  ...createTestCases("docs", [
    {
      id: "docs-search-01",
      prompt: "Search the official TagoIO documentation for 'device tokens'.",
      expectedTool: "search_docs",
      expectedArguments: { query: "device tokens" },
    },
    {
      id: "docs-read-01",
      prompt: "Read the documentation page /docs/tagoio/devices/device-token.md and summarize it.",
      expectedTool: "read_doc",
      expectedArguments: { path: "/docs/tagoio/devices/device-token.md" },
    },
    { id: "docs-overview-01", prompt: "Give me an overview of how the TagoIO platform fits together.", expectedTool: "platform_overview" },
  ]),
  ...createTestCases("code-examples", [
    {
      id: "code-examples-search-01",
      prompt: "Search the analysis code examples for 'how to create a device'.",
      expectedTool: "search_code_examples",
      expectedArguments: { query: "how to create a device", type: "analysis" },
    },
    {
      id: "code-examples-get-01",
      prompt: "Show me the TagoIO node-rt2025 analysis example file console.js.",
      expectedTool: "get_code_example",
      expectedArguments: { type: "analysis", runtime: "node-rt2025", filename: "console.js" },
    },
  ]),
  ...createTestCases("devices", [
    {
      id: "devices-create-02",
      prompt: "Create a device named 'Gateway Probe' using connector 61f0000000000000000c0001 on the network 61f0000000000000000e0001.",
      expectedTool: "create_device",
      expectedArguments: { name: "Gateway Probe", connector: "61f0000000000000000c0001", network: "61f0000000000000000e0001" },
    },
    {
      id: "devices-update-02",
      prompt: "Change the serial number of device 61f0000000000000000d0001 to A81758FFFE03AB01. I understand this rotates every device token and I confirm. Proceed.",
      expectedTool: "update_device",
      expectedArguments: { device_id: "61f0000000000000000d0001", serie_number: "A81758FFFE03AB01", confirm_token_rotation: true },
    },
  ]),
  ...createTestCases("analyses", [
    {
      id: "analyses-create-01",
      prompt: "Create a new analysis named 'Fleet Report' using the node-rt2025 runtime.",
      expectedTool: "create_analysis",
      expectedArguments: { name: "Fleet Report", runtime: "node-rt2025" },
    },
    {
      id: "analyses-update-01",
      prompt: "Deactivate the analysis 61f00000000000000000b001 without deleting it.",
      expectedTool: "update_analysis",
      expectedArguments: { analysis_id: "61f00000000000000000b001", active: false },
    },
    {
      id: "analyses-delete-01",
      prompt: "Permanently delete the analysis 61f00000000000000000b001.",
      expectedTool: "delete_analysis",
      expectedArguments: { analysis_id: "61f00000000000000000b001" },
    },
    {
      id: "analyses-upload-01",
      prompt: "Upload this script to analysis 61f00000000000000000b001 as main.js: console.log('hello')",
      expectedTool: "upload_analysis_script",
      expectedArguments: { analysis_id: "61f00000000000000000b001", filename: "main.js", source: "console.log('hello')" },
    },
    {
      id: "analyses-download-01",
      prompt: "Download the current script of analysis 61f00000000000000000b001.",
      expectedTool: "download_analysis_script",
      expectedArguments: { analysis_id: "61f00000000000000000b001" },
    },
    {
      id: "analyses-run-01",
      prompt: "Trigger a run of analysis 61f00000000000000000b001 now.",
      expectedTool: "run_analysis",
      expectedArguments: { analysis_id: "61f00000000000000000b001" },
    },
    {
      id: "analyses-console-01",
      prompt: "Show me the console output of analysis 61f00000000000000000b001.",
      expectedTool: "read_analysis_console",
      expectedArguments: { analysis_id: "61f00000000000000000b001" },
    },
  ]),
  ...createTestCases("dashboards", [
    {
      id: "dashboards-search-01",
      prompt: "List my dashboards whose label contains 'fleet'.",
      expectedTool: "search_dashboards",
      expectedArguments: { filter: { label: "fleet" } },
    },
    {
      id: "dashboards-get-01",
      prompt: "Show dashboard 61f0000000000000000da001 with its arrangement.",
      expectedTool: "get_dashboard",
      expectedArguments: { dashboard_id: "61f0000000000000000da001" },
    },
    {
      id: "dashboards-create-01",
      prompt: "Create a dashboard labeled 'Fleet Overview'.",
      expectedTool: "create_dashboard",
      expectedArguments: { label: "Fleet Overview" },
    },
    {
      id: "dashboards-update-01",
      prompt: "Rename dashboard 61f0000000000000000da001 to 'Fleet Ops'.",
      expectedTool: "update_dashboard",
      expectedArguments: { dashboard_id: "61f0000000000000000da001", label: "Fleet Ops" },
    },
    {
      id: "dashboards-delete-01",
      prompt: "Permanently delete dashboard 61f0000000000000000da001.",
      expectedTool: "delete_dashboard",
      expectedArguments: { dashboard_id: "61f0000000000000000da001" },
    },
  ]),
  ...createTestCases("widgets", [
    {
      id: "widgets-get-01",
      prompt: "Show widget 61f0000000000000000db001 on dashboard 61f0000000000000000da001.",
      expectedTool: "get_widget",
      expectedArguments: { dashboard_id: "61f0000000000000000da001", widget_id: "61f0000000000000000db001" },
    },
    {
      id: "widgets-create-01",
      prompt: "Add a gauge widget labeled 'Tank Level' to dashboard 61f0000000000000000da001.",
      expectedTool: "create_widget",
      expectedArguments: { dashboard_id: "61f0000000000000000da001", configuration: { type: "gauge", label: "Tank Level" } },
    },
    {
      id: "widgets-update-01",
      prompt: "On dashboard 61f0000000000000000da001, rename widget 61f0000000000000000db001 to 'Fill Level'.",
      expectedTool: "update_widget",
      expectedArguments: { dashboard_id: "61f0000000000000000da001", widget_id: "61f0000000000000000db001", patch: { label: "Fill Level" } },
    },
    {
      id: "widgets-delete-01",
      prompt: "Delete widget 61f0000000000000000db001 from dashboard 61f0000000000000000da001.",
      expectedTool: "delete_widget",
      expectedArguments: { dashboard_id: "61f0000000000000000da001", widget_id: "61f0000000000000000db001" },
    },
    {
      id: "widgets-schema-01",
      prompt: "What is the exact configuration schema for a gauge widget?",
      expectedTool: "widget_schema_lookup",
      expectedArguments: { type: "gauge" },
    },
    {
      id: "widgets-validate-01",
      prompt:
        'Without creating anything, check whether this widget configuration is valid: { "label": "Tank Level", "type": "gauge", "display": { "gauge_type": "solid", "numberformat": "0", "minimum": 0, "maximum": 100 } }.',
      expectedTool: "validate_widget_configuration",
      expectedArguments: { configuration: { type: "gauge", label: "Tank Level" } },
    },
    {
      id: "widgets-get-code-01",
      prompt: "Show me the current source code of the custom widget 61f0000000000000000db004 on dashboard 61f0000000000000000da001.",
      expectedTool: "get_custom_widget_code",
      expectedArguments: { dashboard_id: "61f0000000000000000da001", widget_id: "61f0000000000000000db004" },
    },
    {
      id: "widgets-upload-code-01",
      prompt:
        'Save this source to the custom widget 61f0000000000000000db004 on dashboard 61f0000000000000000da001: import React from "npm:react@19.2.3"; export default function App() { return <p>ok</p>; }',
      expectedTool: "upload_custom_widget_code",
      expectedArguments: { dashboard_id: "61f0000000000000000da001", widget_id: "61f0000000000000000db004" },
    },
  ]),
  ...createTestCases("entities", [
    {
      id: "entities-create-01",
      prompt: "Create an entity named 'Sensor Registry' with a required float field 'temperature' and a string field 'unit'.",
      expectedTool: "create_entity",
      expectedArguments: { name: "Sensor Registry", schema: { temperature: { type: "float", required: true }, unit: { type: "string" } } },
    },
    {
      id: "entities-update-01",
      prompt: "Rename entity 61f0000000000000000f0001 to 'Asset Registry'.",
      expectedTool: "update_entity",
      expectedArguments: { entity_id: "61f0000000000000000f0001", name: "Asset Registry" },
    },
    {
      id: "entities-delete-01",
      prompt: "Delete entity 61f0000000000000000f0001 and everything stored in it.",
      expectedTool: "delete_entity",
      expectedArguments: { entity_id: "61f0000000000000000f0001" },
    },
    {
      id: "entities-schema-01",
      prompt: "Add an optional float field named 'humidity' to entity 61f0000000000000000f0001.",
      expectedTool: "update_entity_schema",
      expectedArguments: { entity_id: "61f0000000000000000f0001", fields: { humidity: { action: "create", type: "float" } } },
    },
    {
      id: "entities-data-read-01",
      prompt: "Show the data rows stored in entity 61f0000000000000000f0001, 50 rows per page.",
      expectedTool: "read_entity_data",
      expectedArguments: { entity_id: "61f0000000000000000f0001", amount: 50 },
    },
    {
      id: "entities-data-send-01",
      prompt: "Insert a data row with temperature 25.5 into entity 61f0000000000000000f0001.",
      expectedTool: "send_entity_data",
      expectedArguments: { entity_id: "61f0000000000000000f0001", data: [{ temperature: 25.5 }] },
    },
    {
      id: "entities-data-edit-01",
      prompt: "In entity 61f0000000000000000f0001, change the row with id 61f0000000000000000fd001 so that temperature is 26.",
      expectedTool: "edit_entity_data",
      expectedArguments: { entity_id: "61f0000000000000000f0001", data: [{ id: "61f0000000000000000fd001", temperature: 26 }] },
    },
    {
      id: "entities-data-delete-01",
      prompt: "Permanently delete the data row with id 61f0000000000000000fd001 from entity 61f0000000000000000f0001.",
      expectedTool: "delete_entity_data",
      expectedArguments: { entity_id: "61f0000000000000000f0001", ids: ["61f0000000000000000fd001"] },
    },
    {
      id: "entities-data-empty-01",
      prompt: "Wipe every data row out of entity 61f0000000000000000f0001; empty it completely but keep the schema.",
      expectedTool: "empty_entity_data",
      expectedArguments: { entity_id: "61f0000000000000000f0001" },
    },
  ]),
  ...createTestCases("run-users", [
    {
      id: "run-users-create-01",
      prompt: "Create an active TagoRUN user named 'Jane Doe' with email jane@example.com, password 's3cure-pass', timezone 'America/New_York'.",
      expectedTool: "create_run_user",
      expectedArguments: { name: "Jane Doe", email: "jane@example.com", password: "s3cure-pass", timezone: "America/New_York", active: true },
    },
    {
      id: "run-users-update-01",
      prompt: "Rename run user 61f00000000000000c900001 to 'Jane Roe'.",
      expectedTool: "update_run_user",
      expectedArguments: { run_user_id: "61f00000000000000c900001", name: "Jane Roe" },
    },
    {
      id: "run-users-delete-01",
      prompt: "Permanently delete TagoRUN user 61f00000000000000c900001.",
      expectedTool: "delete_run_user",
      expectedArguments: { run_user_id: "61f00000000000000c900001" },
    },
    {
      id: "run-users-notifications-read-01",
      prompt: "Show the notifications for run user 61f00000000000000c900001.",
      expectedTool: "read_run_user_notifications",
      expectedArguments: { run_user_id: "61f00000000000000c900001" },
    },
    {
      id: "run-users-notification-send-01",
      prompt: "Send run user 61f00000000000000c900001 a notification titled 'Report ready' saying 'Your monthly report is available.'",
      expectedTool: "send_run_user_notification",
      expectedArguments: { run_user_id: "61f00000000000000c900001", title: "Report ready", message: "Your monthly report is available." },
    },
    {
      id: "run-users-notification-update-01",
      prompt: "Change the title of notification 61f00000000000000ca00001 to 'Report ready (updated)'.",
      expectedTool: "update_run_user_notification",
      expectedArguments: { notification_id: "61f00000000000000ca00001", title: "Report ready (updated)" },
    },
    {
      id: "run-users-notification-delete-01",
      prompt: "Delete notification 61f00000000000000ca00001.",
      expectedTool: "delete_run_user_notification",
      expectedArguments: { notification_id: "61f00000000000000ca00001" },
    },
    {
      id: "run-users-login-01",
      prompt: "Mint a login token so I can debug the app as run user 61f00000000000000c900001 for the next 2 hours.",
      expectedTool: "login_as_run_user",
      expectedArguments: { run_user_id: "61f00000000000000c900001", expire_time: "2 hours" },
    },
  ]),
];

export { EvalCase, FROZEN_SYSTEM_PROMPT, TOOL_PREDICTION_CASES, checkToolPrediction, collectPinMismatches, matchArgumentSubset, matchArrayIncludes };
