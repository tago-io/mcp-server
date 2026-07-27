/**
 * Deterministic fixtures for the MSW handlers. All IDs are fixed 24-character
 * strings and all token values are obviously fake placeholders; never place
 * real credentials here.
 */

const IDS = {
  device: "61f0000000000000000d0001",
  deviceImmutable: "61f0000000000000000d0002",
  connector: "61f0000000000000000c0001",
  network: "61f0000000000000000e0001",
  action: "61f0000000000000000a0001",
  analysis: "61f00000000000000000b001",
  dashboard: "61f0000000000000000da001",
  widget: "61f0000000000000000db001",
  widgetOther: "61f0000000000000000db002",
  widgetUnplaced: "61f0000000000000000db003",
  widgetCustom: "61f0000000000000000db004",
  entity: "61f0000000000000000f0001",
  user: "61f00000000000000c900001",
  profile: "61f00000000000000c800001",
  secret: "61f00000000000000c700001",
  dataRecord: "61f0000000000000000dd001",
  entityDataRow: "61f0000000000000000fd001",
  notification: "61f00000000000000ca00001",
} as const;

const FAKE_DEVICE_TOKEN = "00000000-0000-4000-8000-000000000001";
const FAKE_ANALYSIS_TOKEN = "a-00000000-fake-analysis-token-0001";
const FAKE_RUN_TOKEN = "a-00000000-fake-run-token-00000002";
// Token minted by GET /run/users/:id/login; the sentinel lets tests assert it
// appears only in the intentional result, never in logs or error paths.
const FAKE_RUN_USER_LOGIN_TOKEN = "00000000-fake-run-user-login-token-0003";

// Signed capability URL for script downloads; the query sentinel lets tests
// assert the URL (or any piece of it) never leaks into results or errors.
const SIGNED_SCRIPT_URL = "https://storage.tago.example/scripts/abc?X-Sig=fake-signature-sentinel";

const accountInfo = {
  id: "61f00000000000000000ac01",
  name: "Test Account",
  email: "test@example.com",
  timezone: "UTC",
};

const networkInfoEndpoint = {
  name: "Test Profile Token",
  type: "profile",
};

const deviceListItem = {
  id: IDS.device,
  name: "Temperature Sensor",
  active: true,
  type: "mutable",
  connector: IDS.connector,
  network: IDS.network,
  tags: [{ key: "device_type", value: "sensor" }],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

const deviceInfo = {
  ...deviceListItem,
  description: "A deterministic test device",
  visible: true,
  last_input: "2026-01-02T00:00:00.000Z",
};

const deviceParams = [{ id: "61f0000000000000000dp001", key: "dashboard_url", value: "https://admin.tago.io", sent: true }];

const deviceToken = {
  token: FAKE_DEVICE_TOKEN,
  name: "Default",
  permission: "full",
  serie_number: "0000000000000001",
  expire_time: "never",
  created_at: "2026-01-01T00:00:00.000Z",
};

// SDK-realistic tokenCreate response: token/expire_date/permission, no name.
const deviceTokenCreateResponse = {
  token: "00000000-0000-4000-8000-00000000r0t8",
  expire_date: "never",
  permission: "full",
};

const dataRecord = {
  id: IDS.dataRecord,
  variable: "temperature",
  value: 25.5,
  unit: "°C",
  device: IDS.device,
  group: "1738000000000",
  time: "2026-01-02T00:00:00.000Z",
};

const actionInfo = {
  id: IDS.action,
  name: "Notify on Create",
  active: true,
  type: "resource",
  action: { type: "script", script: [IDS.analysis] },
  tags: [{ key: "action_type", value: "notification" }],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  last_triggered: "2026-01-02T00:00:00.000Z",
};

// Carries sentinel secrets (token, variable value, console) that the safe
// projection tests assert never reach any tool output.
const analysisInfo = {
  id: IDS.analysis,
  name: "Invoice Analysis",
  active: true,
  runtime: "node-rt2025",
  run_on: "tago",
  token: FAKE_ANALYSIS_TOKEN,
  variables: [{ key: "SENTINEL_KEY", value: "sentinel-env-value-do-not-print" }],
  console: ["sentinel console line"],
  tags: [{ key: "analysis_type", value: "invoice" }],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  last_run: "2026-01-02T00:00:00.000Z",
};

const analysisCreateResponse = { id: IDS.analysis, token: FAKE_ANALYSIS_TOKEN };

const analysisScript = 'console.log("fixture analysis script");\n';

const analysisDownloadResponse = { url: SIGNED_SCRIPT_URL, size: 1, size_unit: "KB", expire_at: "2026-01-03T00:00:00.000Z" };

const analysisConsole = ["console entry alpha", "console entry bravo", "console entry charlie"];

const dashboardListItem = {
  id: IDS.dashboard,
  label: "Fleet Overview",
  active: true,
  visible: true,
  type: "dashboard",
  tags: [{ key: "team", value: "ops" }],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

// The arrangement references IDS.widget and IDS.widgetOther, so delete_widget
// preflight refuses those; IDS.widgetUnplaced is deletable.
const dashboardInfo = {
  ...dashboardListItem,
  tabs: [{ key: "overview", value: "Overview" }],
  arrangement: [
    { widget_id: IDS.widget, x: 0, y: 0, width: 4, height: 2 },
    { widget_id: IDS.widgetOther, x: 4, y: 0, width: 4, height: 2 },
  ],
  last_access: null,
};

const dashboardCreateResponse = { dashboard: IDS.dashboard };

// A minimal VALID gauge per @tago-io/dashboard-schema, so widget update
// validation against this current always passes.
const widgetInfo = {
  id: IDS.widget,
  dashboard: IDS.dashboard,
  label: "Tank pressure",
  type: "gauge",
  realtime: null,
  display: { gauge_type: "solid", numberformat: "0", minimum: 0, maximum: 100 },
};

const widgetCreateResponse = { widget: IDS.widget };

// A bundled custom widget: an iframe widget whose display.url points at the
// profile-owned source file and whose artifact_url carries the last build.
const widgetSourceUrl = `https://files.us-e1.tago.io/${IDS.profile}/storage/widgets/${IDS.widgetCustom}.tsx`;
const widgetArtifactUrl = `https://files.us-e1.tago.io/${IDS.profile}/storage/widgets/.bundled/${IDS.widgetCustom}/abc123def456.html`;

const widgetCustomInfo = {
  id: IDS.widgetCustom,
  dashboard: IDS.dashboard,
  label: "Custom metric",
  type: "iframe",
  realtime: null,
  display: { url: widgetSourceUrl, artifact_url: widgetArtifactUrl },
};

// Signed URL returned by GET /file/{profile}/widgets/{id}.tsx?noRedirect=true;
// the query marker lets no-leak sweeps assert it never reaches tool output.
const widgetSourceSignedUrl = `https://storage.tago.example/users/${IDS.profile}/storage/widgets/${IDS.widgetCustom}.tsx?X-Amz-Signature=widget-signed-url-sentinel`;

const widgetSource = 'import React from "npm:react@19.2.3";\n\nexport default function App() {\n  return <p>fixture widget</p>;\n}\n';

const widgetUploadResponse = {
  url: widgetSourceUrl,
  artifact_hash: "abc123def456",
  artifact_url: widgetArtifactUrl,
  bytes: 51234,
  success: true,
  error: null,
  warnings: [],
};

const entityInfo = {
  id: IDS.entity,
  name: "Sensor Registry",
  schema: { field_id: { type: "uuid" }, temperature: { type: "float" } },
  index: {},
  tags: [{ key: "entity_type", value: "sensor" }],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

const entityCreateResponse = { id: IDS.entity };

const entityDataRow = {
  id: IDS.entityDataRow,
  temperature: 25.5,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const runUserInfo = {
  id: IDS.user,
  name: "John Doe",
  email: "john@example.com",
  active: true,
  timezone: "UTC",
  company: "Test Co",
  phone: null,
  language: "en",
  tags: [{ key: "user_type", value: "admin" }],
  last_login: "2026-01-02T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

const runUserCreateResponse = { user: IDS.user };

const runUserNotification = {
  id: IDS.notification,
  title: "Report ready",
  message: "Your monthly report is available.",
  read: false,
  created_at: "2026-01-02T00:00:00.000Z",
};

// The server returns `expire_time` (the SDK type's `expire_date` is a defect),
// and `name` carries the minted token's label, not the run user's name.
const runUserLoginResponse = {
  token: FAKE_RUN_USER_LOGIN_TOKEN,
  name: "Login by Run Administrator(admin@example.com)",
  run_user: IDS.user,
  expire_time: "2026-01-01T01:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
};

const profileInfo = {
  info: {
    id: IDS.profile,
    account: accountInfo.id,
    name: "Test Profile",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  },
  allocation: {},
  account_plan: "free",
};

const profileSummary = {
  limit: { input: 1000000, output: 3000000, sms: 10, email: 100, analysis: 3000, data_records: 800000, run_users: 10, push_notification: 100, file_storage: 200 },
  limit_used: { input: 1000, output: 5000, sms: 0, email: 2, analysis: 60, data_records: 20000, run_users: 1, push_notification: 0, file_storage: 5 },
  amount: { device: 3, bucket: 3, dashboard: 1, analysis: 2, action: 2, am: 0, run_users: 1, dictionary: 0, connectors: 0, networks: 0, tcore: 0 },
};

const profileStatistics = [
  { time: "2026-01-01T00:00:00.000Z", input: 100, output: 500, analysis: 2 },
  { time: "2026-01-02T00:00:00.000Z", input: 120, output: 480, analysis: 3 },
];

const secretInfo = {
  id: IDS.secret,
  key: "TWILIO_SID",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

const connectorInfo = {
  id: IDS.connector,
  name: "HTTP Connector",
  public: true,
  networks: [IDS.network],
  device_parameters: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

// Profile-private twin used by the integration list mocks' presence-only
// `filter.public` semantics (key present => omit marketplace-public rows).
const connectorPrivateInfo = {
  id: "61f0000000000000000c0002",
  name: "Private HTTP Connector",
  public: false,
  networks: [IDS.network],
  device_parameters: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

const networkInfo = {
  id: IDS.network,
  name: "HTTP Network",
  public: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

const networkPrivateInfo = {
  id: "61f0000000000000000e0002",
  name: "Private HTTP Network",
  public: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

function snippetsIndex(runtime: string, snippets: Record<string, unknown>[]) {
  return { runtime, schema_version: 1, generated_at: "2026-01-01T00:00:00.000Z", snippets };
}

// Mirrors the live three-entry node-rt2025 catalog (console.js,
// device-list.js, parse-payload.js) plus a create-device entry so a genuinely
// matching multi-term result exists alongside the generic device-only one.
const snippetsAnalysisIndex = snippetsIndex("node-rt2025", [
  {
    id: "console",
    title: "Console Hello World",
    description: "Hello World example with console output",
    language: "javascript",
    tags: ["basic", "console", "hello-world"],
    filename: "console.js",
    file_path: "node-rt2025/console.js",
  },
  {
    id: "device-list",
    title: "Get Device List",
    description: "Retrieve and filter device list from your account using fetch",
    language: "javascript",
    tags: ["devices", "api", "list", "filtering", "fetch"],
    filename: "device-list.js",
    file_path: "node-rt2025/device-list.js",
  },
  {
    id: "parse-payload",
    title: "Parse Payload Environment Variables",
    description: "Parse and debug analysis environment variables and data",
    language: "javascript",
    tags: ["basic", "debug", "environment", "payload"],
    filename: "parse-payload.js",
    file_path: "node-rt2025/parse-payload.js",
  },
  {
    id: "create-device",
    title: "Create a device",
    description: "Create a new device with the SDK Resources module.",
    language: "javascript",
    tags: ["device", "create"],
    filename: "create-device.js",
    file_path: "node-rt2025/create-device.js",
  },
]);

const snippetsAnalysisLegacyIndex = snippetsIndex("node-legacy", [
  {
    id: "legacy-context",
    title: "Legacy console usage",
    description: "Read the analysis context in the legacy Node runtime.",
    language: "javascript",
    tags: ["context"],
    filename: "legacy-context.js",
    file_path: "node-legacy/legacy-context.js",
  },
]);

const snippetsAnalysisPythonLegacyIndex = snippetsIndex("python-legacy", []);
const snippetsAnalysisPythonIndex = snippetsIndex("python-rt2025", []);
const snippetsAnalysisDenoIndex = snippetsIndex("deno-rt2025", []);

const snippetsParserIndex = snippetsIndex("javascript", [
  {
    id: "base64-decoder",
    title: "Base64 decoder",
    description: "Decode base64 payloads into variables.",
    language: "javascript",
    tags: ["base64", "decoder"],
    filename: "base64-decoder.js",
    file_path: "javascript/base64-decoder.js",
  },
  {
    id: "ignore-variables",
    title: "Ignore variables",
    description: "Filter unwanted variables out of the payload.",
    language: "javascript",
    tags: ["filter"],
    filename: "ignore-variables.js",
    file_path: "javascript/ignore-variables.js",
  },
]);

const snippetSourceConsole = "async function startAnalysis(context, scope) {\n  console.log(context);\n  console.log(scope);\n}\n\nmodule.exports = { startAnalysis };\n";

const snippetSourceParser = 'const decoded = Buffer.from(payload[0].value, "base64").toString("utf-8");\npayload.push({ variable: "decoded", value: decoded });\n';

/**
 * Profile Files storage, keyed exactly as the API stores it: the object key
 * minus the server-side `users/{profile}/storage/` prefix. The handler derives
 * files and folders from these keys the way S3 does (prefix + "/" delimiter),
 * so folder-vs-file discrimination in the tests is the real one.
 *
 * Three entries exist only to pin deletion hazards that path syntax cannot see:
 * `reports.csv` is a FOLDER whose name looks like a file; `ledger.csv` is a file
 * that coexists with a folder of the same name (S3 allows an object key and a
 * prefix to share a name); and `archive..bak/` holds a key the delete route's
 * own rewrite would turn into a different, colliding key.
 */
const fileStorageObjects = [
  { filename: `widgets/${IDS.widgetCustom}.tsx`, size: 2048, last_modified: "2026-01-02T00:00:00.000Z", public: false },
  { filename: `widgets/.bundled/${IDS.widgetCustom}/abc123def456.html`, size: 131072, last_modified: "2026-01-02T00:00:00.000Z", public: true },
  { filename: `widgets/.bundled/${IDS.widgetCustom}/old987654321.html`, size: 65536, last_modified: "2026-01-01T00:00:00.000Z", public: true },
  { filename: "uploads/report.csv", size: 512, last_modified: "2026-01-03T00:00:00.000Z", public: false },
  { filename: "uploads/nested/deep.txt", size: 16, last_modified: "2026-01-03T00:00:00.000Z", public: false },
  { filename: "reports.csv/january.csv", size: 256, last_modified: "2026-01-04T00:00:00.000Z", public: false },
  { filename: "ledger.csv", size: 64, last_modified: "2026-01-05T00:00:00.000Z", public: false },
  { filename: "ledger.csv/january.csv", size: 32, last_modified: "2026-01-05T00:00:00.000Z", public: false },
  { filename: "archive..bak/report.csv", size: 8, last_modified: "2026-01-06T00:00:00.000Z", public: false },
  { filename: "archivebak/report.csv/2025.csv", size: 4096, last_modified: "2026-01-06T00:00:00.000Z", public: false },
];

/** Allocation and usage the list route reports alongside every page, in MB. */
const fileStorageAllocation = { total: 200, usage: 5.25 };

/**
 * A faithful subset of what `GET /am/settings` returns, copied verbatim from
 * the live route rather than paraphrased. The full catalog spans 17 resources;
 * these six carry every distinct shape the validators have to handle:
 *
 * - `analysis`/`device` accepts all four match forms, but `create` drops `id`
 *   (there is no device yet to name), which is the mismatch a match-form check
 *   has to catch.
 * - `analysis`/`file` accepts only `path` and `any`.
 * - `analysis`/`account` accepts only `any`, or `id` and `any`.
 * - `run_user` can be granted on far less than `analysis`, and its one device
 *   grant is a different action set, so a rule valid for one target kind can be
 *   inert for the other.
 */
const amSettings = {
  resources: {
    device: { label: "Device" },
    access_management: { label: "Access Management" },
    file: { label: "File" },
    account: { label: "Account" },
    dashboard: { label: "Dashboard" },
    run_user: { label: "Run User" },
  },
  settings: {
    analysis: {
      device: [
        { label: "Access", value: "access", description: "Allows analyses to access a device", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Create", value: "create", description: "Allows analyses to create a device", match_by: ["tag", "tag_match", "any"] },
        { label: "Delete", value: "delete", description: "Allows analyses to delete a device", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Edit", value: "edit", description: "Allows analyses to edit a device", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Token access", value: "token_access", description: "Allows analyses to manipulate a device's token", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Get data", value: "get_data", description: "Allows analyses to get data from a device", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Send data", value: "send_data", description: "Allows analyses to send data to a device", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Edit data", value: "edit_data", description: "Allows analyses to edit a device's data records", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Delete data", value: "delete_data", description: "Allows analyses to delete a device's data records", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Manage chunks", value: "manage_chunks", description: "Allows analyses to manage a device's chunks", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Export Data", value: "export_data", description: "Allows analyses to export data from a mutable device", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Import Data", value: "import_data", description: "Allows analyses to import data to a device", match_by: ["id", "tag", "tag_match", "any"] },
      ],
      access_management: [
        { label: "Access", value: "access", description: "Allows analyses to access an access management", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Create", value: "create", description: "Allows analyses to create an access management", match_by: ["tag", "tag_match", "any"] },
        { label: "Edit", value: "edit", description: "Allows analyses to edit an access management", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Delete", value: "delete", description: "Allows analyses to delete an access management", match_by: ["id", "tag", "tag_match", "any"] },
      ],
      file: [
        { label: "Access", value: "access", description: "Allows analyses to access a file and permission", match_by: ["path", "any"] },
        { label: "Upload", value: "upload", description: "Allows analyses to upload a file", match_by: ["path", "any"] },
        { label: "Edit", value: "edit", description: "Allows analyses to edit and move a file", match_by: ["path", "any"] },
        { label: "Delete", value: "delete", description: "Allows analyses to delete a file", match_by: ["path", "any"] },
      ],
      // `dashboard` and `sql` exist for BOTH kinds with different action sets,
      // which is what makes a rule valid for one kind and inert for the other.
      dashboard: [
        { label: "Access", value: "access", description: "Allows analyses to access a dashboard", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Create", value: "create", description: "Allows analyses to create a dashboard", match_by: ["tag", "tag_match", "any"] },
        { label: "Edit", value: "edit", description: "Allows analyses to edit a dashboard", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Delete", value: "delete", description: "Allows analyses to delete a dashboard", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Duplicate", value: "duplicate", description: "Allows analyses to duplicate a dashboard", match_by: ["id", "tag", "tag_match", "any"] },
      ],
      sql: [
        { label: "Access", value: "access", description: "Allows analyses to list and view a saved SQL query", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Create", value: "create", description: "Allows analyses to create a saved SQL query", match_by: ["tag", "tag_match", "any"] },
        { label: "Execute", value: "execute", description: "Allows analyses to execute a saved SQL query", match_by: ["id", "tag", "tag_match", "any"] },
      ],
      account: [
        { label: "Access Account Information", value: "access", description: "Allows analyses to access information of account", match_by: ["any"] },
        { label: "Access profile", value: "access_profile", description: "Allows analyses to access a profile from account", match_by: ["id", "any"] },
        {
          label: "Access profile statistics",
          value: "access_profile_statistics",
          description: "Allows analyses to access statistics information of a profile from account",
          match_by: ["id", "any"],
        },
      ],
    },
    run_user: {
      dashboard: [
        { label: "Access", value: "access", description: "Allows users to receive this dashboard", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Arrangement", value: "arrangement", description: "Allows users to move/resize widgets", match_by: ["id", "tag", "tag_match", "any"] },
      ],
      device: [
        { label: "Dashboard access", value: "access", description: "Allows TagoRun users to use this device in the dashboards", match_by: ["id", "tag", "tag_match", "any"] },
      ],
      sql: [
        { label: "Access", value: "access", description: "Allows TagoRun users to list and view a saved SQL query", match_by: ["id", "tag", "tag_match", "any"] },
        { label: "Execute", value: "execute", description: "Allows TagoRun users to execute a saved SQL query", match_by: ["id", "tag", "tag_match", "any"] },
      ],
    },
  },
};

/**
 * Seed policies for the stateful Access Management mock.
 *
 * `accessPolicy` is written with its deny rule FIRST so the info route's
 * `ORDER BY effect ASC` visibly reorders it; a tool that echoed submission
 * order would render the wrong deciding rule. `accessPolicyInert` holds the
 * three shapes the API stores and never honours: a resource tuple of an arity
 * the parser cannot classify, an action the resource does not have, and a match
 * form the grant does not accept.
 */
const accessPolicies = [
  {
    id: "61f00000000000000ab00001",
    profile: IDS.profile,
    name: "[Analysis] - Parser device access",
    active: true,
    tags: [{ key: "purpose", value: "parser" }],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    targets: [["analysis", "id", IDS.analysis]],
    permissions: [
      { effect: "deny", action: ["delete"], resource: ["device", "id", IDS.deviceImmutable] },
      { effect: "allow", action: ["send_data", "get_data"], resource: ["device", "tag.key", "device_type", "tag.value", "sensor"] },
    ],
  },
  {
    id: "61f00000000000000ab00002",
    profile: IDS.profile,
    name: "[Run] - Dashboard access",
    active: false,
    tags: [],
    created_at: "2026-01-03T00:00:00.000Z",
    updated_at: "2026-01-03T00:00:00.000Z",
    targets: [["run_user"]],
    permissions: [{ effect: "allow", action: ["access"], resource: ["dashboard"] }],
  },
  {
    id: "61f00000000000000ab00003",
    profile: IDS.profile,
    name: "[Analysis] - Inert rules",
    active: true,
    tags: [],
    created_at: "2026-01-04T00:00:00.000Z",
    updated_at: "2026-01-04T00:00:00.000Z",
    targets: [["analysis"]],
    permissions: [
      { effect: "allow", action: ["access"], resource: ["device", "id"] },
      { effect: "allow", action: ["login_as_user"], resource: ["device"] },
      { effect: "allow", action: ["create"], resource: ["device", "id", IDS.device] },
      // Half live: `access` fires, `login_as_user` cannot. Marking the whole
      // rule dead would hide a permission the policy really does grant.
      { effect: "allow", action: ["access", "login_as_user"], resource: ["device"] },
      // Storable and meaningless: the action enum has no minimum length.
      { effect: "allow", action: [], resource: ["device"] },
    ],
  },
  {
    // Targets run users, holding a rule that is dead for them (`file` is not
    // grantable to a run user) and would still be dead as an analysis, for a
    // different reason (`upload` does not accept an `id` match). Repointing it
    // makes nothing worse, so it must not be blocked.
    id: "61f00000000000000ab00004",
    profile: IDS.profile,
    name: "[Run] - Already dead rule",
    active: true,
    tags: [],
    created_at: "2026-01-05T00:00:00.000Z",
    updated_at: "2026-01-05T00:00:00.000Z",
    targets: [["run_user"]],
    permissions: [{ effect: "allow", action: ["upload"], resource: ["file", "id", IDS.device] }],
  },
  {
    // Targets analyses, holding a rule with NO actions on a resource run users
    // cannot be granted. The rule grants nothing under any targets, so
    // repointing the policy strands nothing and must not be refused.
    id: "61f00000000000000ab00005",
    profile: IDS.profile,
    name: "[Analysis] - Actionless rule",
    active: true,
    tags: [],
    created_at: "2026-01-06T00:00:00.000Z",
    updated_at: "2026-01-06T00:00:00.000Z",
    targets: [["analysis"]],
    permissions: [{ effect: "allow", action: [], resource: ["file"] }],
  },
  {
    // An unreadable rule beside a live one. The renderer must mark only the
    // first inert and still number them by their stored position.
    id: "61f00000000000000ab00006",
    profile: IDS.profile,
    name: "[Analysis] - Unreadable then live",
    active: true,
    tags: [],
    created_at: "2026-01-07T00:00:00.000Z",
    updated_at: "2026-01-07T00:00:00.000Z",
    targets: [["analysis"]],
    permissions: [
      { effect: "allow", action: ["access"], resource: ["device", "id"] },
      { effect: "allow", action: ["send_data"], resource: ["device"] },
    ],
  },
  {
    // Deny-only, and an `any` target beside narrower ones. Both shapes were
    // found live on a real profile: individually valid rules that add nothing,
    // and a target list that reads narrower than the policy actually is.
    id: "61f00000000000000ab00008",
    profile: IDS.profile,
    name: "[Analysis] - Deny only, any target",
    active: true,
    tags: [],
    created_at: "2026-01-09T00:00:00.000Z",
    updated_at: "2026-01-09T00:00:00.000Z",
    targets: [["analysis", "id", IDS.analysis], ["analysis"]],
    permissions: [{ effect: "deny", action: ["access"], resource: ["device", "id", IDS.device] }],
  },
  {
    // Targets BOTH kinds, which no tool here can produce and a direct API call
    // can. Its `dashboard`/`access` rule is valid for each kind
    // and therefore reaches both, which is the over-grant the split closes.
    // Neither update tool may edit it, and get_access_policy must say why.
    id: "61f00000000000000ab00007",
    profile: IDS.profile,
    name: "[Mixed] - Analysis and run user",
    active: true,
    tags: [],
    created_at: "2026-01-08T00:00:00.000Z",
    updated_at: "2026-01-08T00:00:00.000Z",
    targets: [["analysis", "id", IDS.analysis], ["run_user"]],
    permissions: [{ effect: "allow", action: ["access"], resource: ["dashboard"] }],
  },
];

const fixtures = {
  IDS,
  FAKE_DEVICE_TOKEN,
  FAKE_ANALYSIS_TOKEN,
  FAKE_RUN_TOKEN,
  FAKE_RUN_USER_LOGIN_TOKEN,
  SIGNED_SCRIPT_URL,
  accountInfo,
  networkInfoEndpoint,
  deviceListItem,
  deviceInfo,
  deviceParams,
  deviceToken,
  deviceTokenCreateResponse,
  dataRecord,
  actionInfo,
  analysisInfo,
  analysisCreateResponse,
  analysisScript,
  analysisDownloadResponse,
  analysisConsole,
  dashboardListItem,
  dashboardInfo,
  dashboardCreateResponse,
  widgetInfo,
  widgetCreateResponse,
  widgetCustomInfo,
  widgetSource,
  widgetSourceSignedUrl,
  widgetSourceUrl,
  widgetArtifactUrl,
  widgetUploadResponse,
  entityInfo,
  entityCreateResponse,
  entityDataRow,
  runUserInfo,
  runUserCreateResponse,
  runUserNotification,
  runUserLoginResponse,
  profileInfo,
  profileSummary,
  profileStatistics,
  secretInfo,
  connectorInfo,
  connectorPrivateInfo,
  networkInfo,
  networkPrivateInfo,
  snippetsAnalysisIndex,
  snippetsAnalysisLegacyIndex,
  snippetsAnalysisPythonLegacyIndex,
  snippetsAnalysisPythonIndex,
  snippetsAnalysisDenoIndex,
  snippetsParserIndex,
  snippetSourceConsole,
  snippetSourceParser,
  fileStorageObjects,
  fileStorageAllocation,
  amSettings,
  accessPolicies,
};

export { fixtures };
