import { readFileSync } from "node:fs";
import { join } from "node:path";

// package.json is the single source of truth for the server version.
// The relative depth is identical from src/utils (tsx) and build/utils (compiled).
const packageJson = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf-8")) as { version: string };

const SERVER_NAME = "tagoio-mcp-server";
const SERVER_VERSION = packageJson.version;
const SERVER_INSTRUCTIONS = `This server manages a TagoIO IoT account: its devices, device data, actions, analyses, entities, run users, connectors/networks, and profile metrics.

Concept map: devices receive sensor data over HTTP/MQTT through a connector (payload decoder) + network (transport) pair and store it as time-series variables; payload parsers transform data at ingest. Analyses are serverless scripts triggered by actions (condition/schedule triggers), dashboards, or API calls, and automate work across devices. Dashboards read device variables through widgets; entities are schema-based tables for relational-style data; run users are end users of the TagoRUN portal governed by access policies.

Tool groups: device & data management; actions & automation; analysis lookup; entities & run users; profile info & metrics; connector/network lookup; and docs/teaching tools: call platform_overview for the concept map, then search_docs to find official doc pages, then read_doc to read them.

Key constraints: destructive operations (deleting devices, data, or tokens) are permanent and unrecoverable; confirm before executing. Every data read counts against the profile's Data Output limit, so keep queries narrow. Name filters support wildcards (e.g. *sensor*). Ground any platform-behavior claim in search_docs/read_doc results rather than assumptions.`;

export { SERVER_NAME, SERVER_VERSION, SERVER_INSTRUCTIONS };
