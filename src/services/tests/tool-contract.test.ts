import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Resources } from "@tago-io/sdk";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../../server/build-server";
import { mockServer, strictListenOptions } from "../../testing/mocks/server";
import { TEST_REGION } from "../../testing/context";
import { toolCatalog } from "../catalog";

/**
 * Per-tool MCP contract tests: every catalog tool is called through a real
 * in-memory MCP client/server pair with a real SDK Resources instance whose
 * HTTP traffic is served by MSW fixtures. One happy path and one invalid
 * input per tool. Tools without an entry here fail the completeness check.
 */
const ANALYSIS_TOKEN = "a-0000000000000000000000000000000000";
const DEVICE_ID = "61f0000000000000000d0001";

interface ContractCase {
  happy: Record<string, unknown>;
  invalid: Record<string, unknown>;
}

const ACTION_ID = "61f0000000000000000a0001";
const ANALYSIS_ID = "61f00000000000000000b001";
const ENTITY_ID = "61f0000000000000000f0001";
const USER_ID = "61f00000000000000c900001";
const NOTIFICATION_ID = "61f00000000000000ca00001";
const CONNECTOR_ID = "61f0000000000000000c0001";
const NETWORK_ID = "61f0000000000000000e0001";
const DASHBOARD_ID = "61f0000000000000000da001";
const WIDGET_ID = "61f0000000000000000db001";
// Not referenced by the fixture dashboard arrangement, so delete_widget's
// placement preflight lets it through.
const WIDGET_UNPLACED_ID = "61f0000000000000000db003";
const WIDGET_CUSTOM_ID = "61f0000000000000000db004";
const ACCESS_POLICY_ID = "61f00000000000000ab00001";
// Deleted by the delete case, so it must not be the policy other cases read.
const ACCESS_POLICY_INERT_ID = "61f00000000000000ab00003";
const RUN_USER_POLICY_ID = "61f00000000000000ab00002";

// Minimal valid gauge per @tago-io/dashboard-schema.
const VALID_GAUGE_CONFIGURATION = { label: "Contract Gauge", type: "gauge", display: { gauge_type: "solid", numberformat: "0", minimum: 0, maximum: 100 } };

const contractCases: Record<string, ContractCase> = {
  search_devices: { happy: {}, invalid: { amount: 0 } },
  get_device: { happy: { device_id: DEVICE_ID }, invalid: { device_id: "too-short" } },
  create_device: { happy: { name: "Contract Device", connector: CONNECTOR_ID }, invalid: { connector: CONNECTOR_ID } },
  update_device: { happy: { device_id: DEVICE_ID, name: "Renamed" }, invalid: { device_id: "too-short" } },
  delete_device: { happy: { device_id: DEVICE_ID }, invalid: {} },
  configure_device: {
    happy: { device_id: DEVICE_ID, configuration_params: [{ key: "url", value: "https://admin.tago.io", sent: false }] },
    invalid: { device_id: DEVICE_ID, configuration_params: [] },
  },
  read_device_data: { happy: { device_id: DEVICE_ID }, invalid: { device_id: "too-short" } },
  send_device_data: { happy: { device_id: DEVICE_ID, data: [{ variable: "temperature", value: 25.5 }] }, invalid: { device_id: DEVICE_ID, data: [] } },
  edit_device_data: { happy: { device_id: DEVICE_ID, data: [{ id: "61f0000000000000000dd001", unit: "°F" }] }, invalid: { device_id: DEVICE_ID, data: [] } },
  delete_device_data: { happy: { device_id: DEVICE_ID, variables: ["temperature"], qty: 1 }, invalid: { device_id: "too-short" } },
  search_actions: { happy: {}, invalid: { amount: 0 } },
  get_action: { happy: { action_id: ACTION_ID }, invalid: { action_id: "too-short" } },
  create_action: {
    happy: {
      name: "Contract Action",
      type: "resource",
      action: { type: "script", script: [ANALYSIS_ID] },
      trigger: [{ resource: "device", when: "create", tag_key: "device_type", tag_value: "sensor" }],
    },
    invalid: { name: "Broken", type: "resource", action: { type: "script" } },
  },
  update_action: { happy: { action_id: ACTION_ID, name: "Renamed" }, invalid: { action_id: "too-short" } },
  delete_action: { happy: { action_id: ACTION_ID }, invalid: {} },
  search_analyses: { happy: {}, invalid: { amount: 0 } },
  get_analysis: { happy: { analysis_id: ANALYSIS_ID }, invalid: { analysis_id: "too-short" } },
  create_analysis: { happy: { name: "Contract Analysis" }, invalid: {} },
  update_analysis: { happy: { analysis_id: ANALYSIS_ID, name: "Renamed" }, invalid: { analysis_id: "too-short" } },
  delete_analysis: { happy: { analysis_id: ANALYSIS_ID }, invalid: {} },
  upload_analysis_script: { happy: { analysis_id: ANALYSIS_ID, filename: "script.js", source: "console.log(1)" }, invalid: { analysis_id: ANALYSIS_ID, filename: "script.js" } },
  download_analysis_script: { happy: { analysis_id: ANALYSIS_ID }, invalid: { analysis_id: "too-short" } },
  run_analysis: { happy: { analysis_id: ANALYSIS_ID }, invalid: {} },
  read_analysis_console: { happy: { analysis_id: ANALYSIS_ID }, invalid: { analysis_id: "too-short" } },
  search_dashboards: { happy: {}, invalid: { amount: 0 } },
  get_dashboard: { happy: { dashboard_id: DASHBOARD_ID }, invalid: { dashboard_id: "too-short" } },
  create_dashboard: { happy: { label: "Contract Dashboard" }, invalid: {} },
  update_dashboard: { happy: { dashboard_id: DASHBOARD_ID, label: "Renamed" }, invalid: { dashboard_id: "too-short" } },
  delete_dashboard: { happy: { dashboard_id: DASHBOARD_ID }, invalid: {} },
  get_widget: { happy: { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID }, invalid: { dashboard_id: DASHBOARD_ID, widget_id: "too-short" } },
  create_widget: {
    happy: { dashboard_id: DASHBOARD_ID, configuration: VALID_GAUGE_CONFIGURATION },
    // Fails schema validation (gauge without display) before any SDK traffic.
    invalid: { dashboard_id: DASHBOARD_ID, configuration: { type: "gauge" } },
  },
  update_widget: {
    happy: { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: { label: "Renamed" } },
    invalid: { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_ID, patch: {} },
  },
  delete_widget: { happy: { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_UNPLACED_ID }, invalid: {} },
  widget_schema_lookup: { happy: { type: "gauge" }, invalid: { type: "not-a-widget" } },
  get_custom_widget_code: { happy: { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_CUSTOM_ID }, invalid: { dashboard_id: DASHBOARD_ID, widget_id: "too-short" } },
  upload_custom_widget_code: {
    happy: { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_CUSTOM_ID, source: 'import React from "npm:react@19.2.3";\nexport default function App() { return null; }' },
    invalid: { dashboard_id: DASHBOARD_ID, widget_id: WIDGET_CUSTOM_ID },
  },
  validate_widget_configuration: {
    happy: { configuration: VALID_GAUGE_CONFIGURATION },
    // Fails schema validation (gauge without display); validation is local, no SDK traffic on either path.
    invalid: { configuration: { type: "gauge" } },
  },
  search_entities: { happy: {}, invalid: { amount: 0 } },
  get_entity: { happy: { entity_id: ENTITY_ID }, invalid: { entity_id: "too-short" } },
  create_entity: {
    happy: { name: "Contract Entity", schema: { temperature: { type: "float", required: true } }, index: { temp_idx: { fields: ["temperature"] } } },
    // Reserved field rejected by the pre-SDK validation, not the wire.
    invalid: { name: "Contract Entity", schema: { id: { type: "string" } } },
  },
  update_entity: { happy: { entity_id: ENTITY_ID, name: "Renamed" }, invalid: { entity_id: ENTITY_ID } },
  delete_entity: { happy: { entity_id: ENTITY_ID }, invalid: {} },
  update_entity_schema: {
    happy: { entity_id: ENTITY_ID, fields: { humidity: { action: "create", type: "float" } } },
    // The update action cannot carry a type; field types are immutable.
    invalid: { entity_id: ENTITY_ID, fields: { humidity: { action: "update", type: "string" } } },
  },
  read_entity_data: { happy: { entity_id: ENTITY_ID }, invalid: { entity_id: "too-short" } },
  send_entity_data: { happy: { entity_id: ENTITY_ID, data: [{ temperature: 25.5 }] }, invalid: { entity_id: ENTITY_ID, data: [] } },
  edit_entity_data: {
    happy: { entity_id: ENTITY_ID, data: [{ id: "61f0000000000000000fd001", temperature: 26 }] },
    // An id-only entry carries nothing to change; rejected before any SDK traffic.
    invalid: { entity_id: ENTITY_ID, data: [{ id: "61f0000000000000000fd001" }] },
  },
  delete_entity_data: { happy: { entity_id: ENTITY_ID, ids: ["61f0000000000000000fd001"] }, invalid: { entity_id: ENTITY_ID, ids: [] } },
  empty_entity_data: { happy: { entity_id: ENTITY_ID }, invalid: {} },
  search_files: { happy: {}, invalid: { amount: 0 } },
  // The fixture storage holds this exact key as a file, so verification passes.
  delete_files: { happy: { paths: [`widgets/${WIDGET_CUSTOM_ID}.tsx`] }, invalid: { paths: [] } },
  search_access_policies: { happy: {}, invalid: { amount: 0 } },
  get_access_policy: { happy: { access_policy_id: ACCESS_POLICY_ID }, invalid: { access_policy_id: "too-short" } },
  lookup_access_permissions: { happy: { target_type: "analysis", resource: "device" }, invalid: { target_type: "profile" } },
  create_analysis_access_policy: {
    happy: {
      name: "Contract Policy",
      targets: [{ by: "id", id: ANALYSIS_ID }],
      permissions: [{ effect: "allow", resource: "device", actions: ["send_data"] }],
    },
    // `device`/`create` accepts no `id` match form, so the rule could never
    // fire; refused before any SDK traffic.
    invalid: {
      name: "Contract Policy",
      targets: [{ by: "any" }],
      permissions: [{ effect: "allow", resource: "device", actions: ["create"], match: { by: "id", id: DEVICE_ID } }],
    },
  },
  create_run_user_access_policy: {
    happy: {
      name: "Contract Run Policy",
      targets: [{ by: "any" }],
      permissions: [{ effect: "allow", resource: "dashboard", actions: ["access"] }],
    },
    // A run user can only be granted `access` on a device, so `send_data`
    // would be stored and never fire; refused before any SDK traffic.
    invalid: {
      name: "Contract Run Policy",
      targets: [{ by: "any" }],
      permissions: [{ effect: "allow", resource: "device", actions: ["send_data"] }],
    },
  },
  update_analysis_access_policy: {
    happy: { access_policy_id: ACCESS_POLICY_ID, active: false },
    // No editable field alongside the ID; rejected before any SDK traffic.
    invalid: { access_policy_id: ACCESS_POLICY_ID },
  },
  update_run_user_access_policy: {
    happy: { access_policy_id: RUN_USER_POLICY_ID, active: false },
    invalid: { access_policy_id: RUN_USER_POLICY_ID },
  },
  delete_access_policy: { happy: { access_policy_id: ACCESS_POLICY_INERT_ID }, invalid: {} },
  search_run_users: { happy: {}, invalid: { amount: 0 } },
  get_run_user: { happy: { run_user_id: USER_ID }, invalid: { run_user_id: "too-short" } },
  create_run_user: {
    happy: { name: "Contract User", email: "contract@example.com", password: "s3cure-pass", timezone: "UTC" },
    invalid: { name: "Contract User" },
  },
  update_run_user: {
    happy: { run_user_id: USER_ID, name: "Renamed" },
    // No editable field alongside the ID; rejected before any SDK traffic.
    invalid: { run_user_id: USER_ID },
  },
  delete_run_user: { happy: { run_user_id: USER_ID }, invalid: {} },
  read_run_user_notifications: { happy: { run_user_id: USER_ID }, invalid: { run_user_id: "too-short" } },
  send_run_user_notification: { happy: { run_user_id: USER_ID, title: "Hi", message: "Body" }, invalid: { run_user_id: USER_ID, title: "Hi" } },
  update_run_user_notification: {
    happy: { notification_id: NOTIFICATION_ID, title: "Updated" },
    // No editable field alongside the ID; rejected before any SDK traffic.
    invalid: { notification_id: NOTIFICATION_ID },
  },
  delete_run_user_notification: { happy: { notification_id: NOTIFICATION_ID }, invalid: {} },
  login_as_run_user: {
    happy: { run_user_id: USER_ID, expire_time: "1 hour" },
    // "never" is refused before any SDK traffic.
    invalid: { run_user_id: USER_ID, expire_time: "never" },
  },
  get_profile: { happy: {}, invalid: { response_format: "bogus" } },
  get_profile_limits: { happy: {}, invalid: { response_format: "bogus" } },
  get_profile_statistics: { happy: {}, invalid: { periodicity: "hourly" } },
  search_secrets: { happy: {}, invalid: { amount: 0 } },
  search_connectors: { happy: { name: "HTTP" }, invalid: { amount: 0 } },
  get_connector: { happy: { connector_id: CONNECTOR_ID }, invalid: { connector_id: "too-short" } },
  search_networks: { happy: {}, invalid: { amount: 0 } },
  get_network: { happy: { network_id: NETWORK_ID }, invalid: { network_id: "too-short" } },
  search_docs: {
    happy: { query: "device token" },
    invalid: { query: "" },
  },
  read_doc: {
    happy: { path: "/docs/tagoio/devices/device-token.md" },
    invalid: {},
  },
  platform_overview: {
    happy: {},
    invalid: { unexpected: 1 },
  },
  search_code_examples: {
    happy: { query: "create a device", type: "analysis", runtime: "node-rt2025" },
    invalid: { query: "", type: "analysis" },
  },
  get_code_example: {
    happy: { type: "analysis", runtime: "node-rt2025", filename: "console.js" },
    invalid: { type: "analysis", filename: "console.js" },
  },
};

// platform_overview takes an empty schema; unknown keys are stripped by zod,
// so its "invalid" case is legitimately a success. Tracked here explicitly.
const INVALID_INPUT_IS_ACCEPTED = new Set(["platform_overview"]);

async function connect() {
  const resources = new Resources({ token: ANALYSIS_TOKEN, region: TEST_REGION });
  const server = buildServer({ resources, token: ANALYSIS_TOKEN, region: TEST_REGION, credentialKind: "analysis" });
  const client = new Client({ name: "contract-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("tool contract coverage", () => {
  it("has a contract case for every catalog tool", () => {
    const catalogNames = toolCatalog.map((tool) => tool.name).sort();
    const caseNames = Object.keys(contractCases).sort();
    expect(caseNames).toEqual(catalogNames);
  });
});

describe.each(toolCatalog.map((tool) => [tool.name] as const))("%s", (toolName) => {
  it("returns a non-error text result for valid input", async () => {
    const cases = contractCases[toolName];
    if (!cases) {
      throw new Error(`no contract case for ${toolName}`);
    }

    const { client, server } = await connect();
    try {
      const result = await client.callTool({ name: toolName, arguments: cases.happy });
      expect(result.isError, `happy path for ${toolName} errored: ${JSON.stringify(result.content)}`).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content.length).toBeGreaterThan(0);
      expect(content[0].type).toBe("text");
      expect(content[0].text.length).toBeGreaterThan(0);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects invalid input with an error result", async () => {
    const cases = contractCases[toolName];
    if (!cases) {
      throw new Error(`no contract case for ${toolName}`);
    }

    const { client, server } = await connect();
    try {
      const result = await client.callTool({ name: toolName, arguments: cases.invalid }).catch((error) => ({ isError: true, content: [{ type: "text", text: String(error) }] }));

      if (INVALID_INPUT_IS_ACCEPTED.has(toolName)) {
        expect(result.isError).toBeFalsy();
      } else {
        expect(result.isError, `invalid input for ${toolName} was accepted`).toBe(true);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});

/**
 * Deterministic, lossless normalization for snapshotting JSON Schemas: sorts
 * object keys recursively and preserves everything else (required arrays,
 * enums, unions (anyOf/oneOf), min/max bounds, defaults, nested properties,
 * and array item schemas) so semantic contract drift is visible in review.
 */
function normalizeJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonSchema);
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    return Object.fromEntries(sortedKeys.map((key) => [key, normalizeJsonSchema(record[key])]));
  }
  return value;
}

async function listNormalizedTools() {
  const { client, server } = await connect();
  try {
    const { tools } = await client.listTools();
    return tools
      .map((tool) => ({
        name: tool.name,
        title: tool.title,
        annotations: tool.annotations,
        inputSchema: normalizeJsonSchema(tool.inputSchema),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await client.close();
    await server.close();
  }
}

describe("schema normalization", () => {
  it("preserves required arrays, enums, unions, bounds, defaults, and nested/item schemas", () => {
    const fixture = {
      type: "object",
      required: ["name", "type"],
      properties: {
        type: { enum: ["mutable", "immutable"], default: "mutable" },
        name: { type: "string", minLength: 1 },
        amount: { type: "integer", minimum: 1, maximum: 200, default: 20 },
        action: {
          anyOf: [
            { type: "object", required: ["script"], properties: { script: { type: "array", items: { type: "string" } } } },
            { type: "object", required: ["message", "to"], properties: { to: { type: "string" }, message: { type: "string" } } },
          ],
        },
      },
    };

    const normalized = normalizeJsonSchema(fixture) as typeof fixture;
    expect(normalized.required).toEqual(["name", "type"]);
    expect(normalized.properties.type.enum).toEqual(["mutable", "immutable"]);
    expect(normalized.properties.type.default).toBe("mutable");
    expect(normalized.properties.amount).toEqual({ type: "integer", minimum: 1, maximum: 200, default: 20 });
    expect(normalized.properties.action.anyOf).toHaveLength(2);
    expect(normalized.properties.action.anyOf[0].required).toEqual(["script"]);
    expect(normalized.properties.action.anyOf[0].properties.script?.items).toEqual({ type: "string" });
    // Determinism: object keys come out sorted at every level.
    expect(Object.keys(normalized.properties)).toEqual(["action", "amount", "name", "type"]);
    expect(normalizeJsonSchema(fixture)).toEqual(normalized);
  });
});

describe("tool listing snapshot", () => {
  it("matches the committed catalog snapshot (names, titles, annotations, full input schemas)", async () => {
    expect(await listNormalizedTools()).toMatchSnapshot();
  });

  // Guards against a cross-field rule being placed on a tool's top-level
  // `parameters` schema (a ZodEffects), which the MCP SDK cannot introspect;
  // it would silently collapse the advertised input schema to empty properties.
  // Only platform_overview is legitimately parameterless.
  it("advertises non-empty input properties for every tool that takes parameters", async () => {
    const PARAMETERLESS = new Set(["platform_overview"]);
    const tools = await listNormalizedTools();
    for (const tool of tools) {
      const schema = tool.inputSchema as { properties?: Record<string, unknown> };
      const propertyCount = Object.keys(schema.properties ?? {}).length;
      if (PARAMETERLESS.has(tool.name)) {
        expect(propertyCount, `${tool.name} should be parameterless`).toBe(0);
      } else {
        expect(propertyCount, `${tool.name} advertises no input properties: a top-level ZodEffects on parameters?`).toBeGreaterThan(0);
      }
    }
  });

  it("exposes the semantic schema contract in the snapshotted listing (create_action)", async () => {
    const tools = await listNormalizedTools();
    const createAction = tools.find((tool) => tool.name === "create_action");
    expect(createAction).toBeDefined();

    const schema = createAction?.inputSchema as {
      required?: string[];
      properties?: Record<string, { anyOf?: unknown[]; enum?: string[] }>;
    };
    expect(schema.required).toContain("name");
    expect(schema.required).toContain("type");
    expect(schema.required).toContain("action");
    expect(schema.properties?.type?.enum).toContain("interval");
    expect(schema.properties?.action?.anyOf?.length).toBeGreaterThan(1);
  });
});
