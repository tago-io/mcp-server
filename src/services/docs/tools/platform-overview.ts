import { IToolConfig } from "../../types";

const PLATFORM_OVERVIEW = `# TagoIO Platform Overview

A concept map of the TagoIO IoT platform. For details on any topic, call \`search_docs\` and then \`read_doc\` on the returned paths.

## Devices

Devices are the link between external things and the data in an account; anything that sends or receives data from TagoIO does it through a device, over HTTP or MQTT in JSON format.

- **Storage type** is chosen at creation: **Immutable** (append-only telemetry, up to 36 million data points per device, native data retention via \`chunk_period\`/\`chunk_retention\`), **Mutable** (editable/deletable records, limited to 50k registers, no native retention), or **Hybrid** (both sides in one device, routed by a required \`mutable_variable_regex\`).
- Devices are created from a **connector + network pairing**: the network is the transport integration (how bytes arrive), the connector decodes the vendor payload into variables.
- Each device has one or more **device tokens**: the secret used by the hardware to authenticate. Device tokens carry no type prefix (unlike other TagoIO tokens).
- **Configuration parameters** are key-value settings on a device, used for downlink settings, decoding hints, widget filters, and Analysis logic.
- Each device (or its connector) can run a **payload parser**: JavaScript that transforms the raw payload into variables at ingest time.

## Data

- A data record has a \`variable\`, a \`value\`, and optionally \`unit\`, \`time\`, \`group\`, \`location\`, and \`metadata\`.
- The \`group\` field synchronizes variables sent together so they can be joined later (e.g. rows of a table widget).
- \`metadata\` customizes widget behavior and appearance per record.
- Data queries support filtering by variable, group, and time range, plus ordering, pagination, and aggregations (e.g. min/max/avg/sum/count and last/first value queries).
- Every data read counts against the profile's **Data Output** limit; writes count against **Data Input**.
- Reading device data uses a credential-specific route: a **device token** calls \`GET /data\`, implicitly bound to the one device the token authenticates, no device ID in the path; a **profile or analysis token** calls \`GET /device/:device_id/data\`. There is no \`GET /data/:device_id\` route.

## Storage

Device data lives in the device's own storage (bucket); the storage type above dictates capacity, editability, and retention. Long-lived immutable data is organized in chunks that can be exported or dropped through chunk management.

## Analysis

Analyses are serverless scripts that run inside TagoIO (Deno, Node.js, or Python runtimes) or externally on your own infrastructure. They run asynchronously, triggered by Actions (schedule or condition), dashboard UI elements, or external API calls, and are used to transform data across devices, call third-party APIs, send notifications, and automate workflows. Runtime counts against the profile's Analysis limits.

An Analysis reaches device data with its analysis token via \`GET /device/:device_id/data\`, and that access is granted by **Access Management** policies with \`get_data\` permission matching the requested device's ID or tags, not by "the device that owns the Analysis"; an Analysis has no implicit device of its own.

## Actions

Actions execute operations when events you define occur: run an Analysis, send email/SMS/push notifications, make HTTP POST requests, or publish to an MQTT topic. Trigger types: **Variable** (\`condition\`, a variable meets conditions), **Resource** (\`resource\`, a device/analysis/etc. is created, modified, or deleted), **Schedule** (\`interval\` or \`schedule\`, every N hours or cron-like dates), **MQTT Topic** (\`mqtt_topic\`), **Usage Alert** (\`usage_alert\`, service usage crosses a percentage), and **Geofence** (\`condition_geofence\`, location data enters/leaves an area). Use Trigger Unlock (reset conditions) to keep condition triggers from firing repeatedly.

## Dashboards & Widgets

Dashboards hold widgets that visualize and interact with device data in real time; widgets read variables from devices (or entities).

- **Normal dashboards** are statically wired to specific devices.
- **Blueprint dashboards** link widgets to dynamic "blueprint devices" the viewer picks at runtime, so one dashboard serves hundreds of devices/users.

## Entities

Entities are the schema-based, next-generation tables: custom typed fields (columns), optional indexes for retrieval performance, and mandatory \`id\`/\`created_at\`/\`updated_at\` fields. Use them for relational-style data (sites, contacts, equipment, org metadata) rather than high-frequency sensor telemetry.

## TagoRUN

TagoRUN is the white-label end-user portal. **Run users** sign in to TagoRUN (not the admin console) and see dashboards shared with them; **Access Management** policies define what run users (and Analyses) can see and do.

## Profiles & Tokens

An **account** contains one or more **profiles**; each profile has its own resources (devices, analyses, dashboards) and its own service limits. Token hierarchy:

- **Profile (account) tokens** (\`p-\` prefix): manage all resources in a profile.
- **Analysis tokens** (\`a-\` prefix): issued to a running Analysis.
- **Run user tokens** (\`u-\` prefix) and **network tokens** (\`n-\` prefix).
- **Device tokens** (no prefix): authenticate a single device's data traffic.

## Regions

Every profile and token lives in a region: **us-e1** (default, https://api.us-e1.tago.io), **eu-w1**, or a dedicated TagoDeploy instance. API calls must target the token's region.

## Integrations

**Connectors** are pre-defined decoders that translate a vendor's payload format into TagoIO variables; **networks** are transport integrations (LoRaWAN LNS, MQTT, HTTP, middleware) that move data between devices and TagoIO. A device is always attached to one connector/network pair.

## Five decision traps

### 1. Storage type cannot be changed after creation

Mutable vs immutable (vs hybrid) is decided when the device is created and data exists; converting requires the device to be disabled and empty. Immutable devices need \`chunk_period\` (and retention) thought through up front, and individual immutable records can never be edited or deleted. Ask "will I ever need to edit or delete individual data points?" before creating the device.

### 2. Payload parser vs Analysis

Payload parsers transform data inline at ingest, per device or connector, before storage, with no trigger and no extra runtime cost. Analyses run asynchronously on triggers and can reach across devices and external APIs. Don't use an Analysis for a job a parser can do (unit conversion, filtering out variables, decoding); it adds latency and consumes Analysis runtime.

### 3. Blueprint dashboards depend on naming discipline

A blueprint dashboard switches between devices at runtime, so every candidate device must share consistent tags (to be selectable) and consistent variable names (so widgets resolve). Inconsistent tagging or per-device variable names silently break the dashboard for some devices.

### 4. Token hierarchy and regions

Profile tokens, analysis tokens, run user tokens, and device tokens are different credentials with different scopes; one cannot substitute for another. Every token is also region-bound: using a valid token against the wrong regional endpoint fails and looks like an authentication error. When auth fails, check the region before regenerating tokens.

### 5. Device vs Entity

Devices store time-series sensor data (variable/value/time records) and are optimized for high-frequency writes. Entities are schema-defined tables with typed fields and indexes for relational-style data with less frequent writes. Storing table-like reference data in a device, or telemetry in an entity, fights the platform's limits and query models.
`;

// Static by design: an empty-input tool the agent can call before its first
// platform question, with zero network or account dependency.
async function platformOverviewTool(): Promise<string> {
  return PLATFORM_OVERVIEW;
}

const platformOverviewConfigJSON: IToolConfig = {
  name: "platform_overview",
  description: `Returns a static concept map of the TagoIO platform: devices and storage types, data records and the credential-specific device-data routes, analyses, actions and their trigger types, dashboards and widgets, entities, TagoRUN and run users, profiles/tokens/regions, and connector/network integrations, plus the five most common decision traps (storage type immutability, parser vs analysis, blueprint naming discipline, token/region mismatches, device vs entity).

Call this first when reasoning about how TagoIO concepts fit together or before designing a solution. Takes no input. For specifics beyond the overview, escalate to search_docs and read_doc.

<example>
{}
</example>`,
  parameters: {},
  title: "TagoIO Platform Overview",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: platformOverviewTool,
};

export { platformOverviewConfigJSON };
