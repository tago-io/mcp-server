<br/>

<p align="center">
  <img src="https://assets.tago.io/tagoio/tagoio.png" width="250px" alt="TagoIO"></img>
</p>

# TagoIO | MCP Server

Connect your AI assistant to your TagoIO devices, data, and platform resources — directly from your IDE or AI tool.

[![Install in VS Code](https://img.shields.io/badge/Install_in-VS_Code-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=%40tago-io%2Fmcp&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.ai.tago.io%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22%24%7Binput%3Atagoio-token%7D%22%2C%22x-tagoio-region%22%3A%22us-e1%22%7D%2C%22inputs%22%3A%5B%7B%22id%22%3A%22tagoio-token%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Enter%20your%20TagoIO%20Profile%20Token%20(Bearer%20format)%22%2C%22password%22%3Atrue%7D%5D%7D)
[![Install in VS Code Insiders](https://img.shields.io/badge/Install_in-VS_Code_Insiders-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=%40tago-io%2Fmcp&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.ai.tago.io%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22%24%7Binput%3Atagoio-token%7D%22%2C%22x-tagoio-region%22%3A%22us-e1%22%7D%2C%22inputs%22%3A%5B%7B%22id%22%3A%22tagoio-token%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Enter%20your%20TagoIO%20Profile%20Token%20(Bearer%20format)%22%2C%22password%22%3Atrue%7D%5D%7D&quality=insiders)
[![Install in Visual Studio](https://img.shields.io/badge/Install_in-Visual_Studio-C16FDE?style=flat-square&logo=visualstudio&logoColor=white)](https://vs-open.link/mcp-install?%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.ai.tago.io%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22%24%7Binput%3Atagoio-token%7D%22%2C%22x-tagoio-region%22%3A%22us-e1%22%7D%2C%22inputs%22%3A%5B%7B%22id%22%3A%22tagoio-token%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Enter%20your%20TagoIO%20Profile%20Token%20(Bearer%20format)%22%2C%22password%22%3Atrue%7D%5D%7D)
[![Install in Cursor](https://img.shields.io/badge/Install_in-Cursor-000000?style=flat-square&logoColor=white)](https://cursor.com/en/install-mcp?name=%40tago-io%2Fmcp&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHBzOi8vbWNwLmFpLnRhZ28uaW8iLCJoZWFkZXJzIjp7IkF1dGhvcml6YXRpb24iOiIke2lucHV0OnRhZ29pby10b2tlbn0iLCJ4LXRhZ29pby1yZWdpb24iOiJ1cy1lMSJ9LCJpbnB1dHMiOlt7ImlkIjoidGFnb2lvLXRva2VuIiwidHlwZSI6InByb21wdFN0cmluZyIsImRlc2NyaXB0aW9uIjoiRW50ZXIgeW91ciBUYWdvSU8gUHJvZmlsZSBUb2tlbiAoQmVhcmVyIGZvcm1hdCkiLCJwYXNzd29yZCI6dHJ1ZX1dfQ==)
[![Add to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=%40tago-io%2Fmcp&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHBzOi8vbWNwLmFpLnRhZ28uaW8iLCJoZWFkZXJzIjp7IkF1dGhvcml6YXRpb24iOiIke2lucHV0OnRhZ29pby10b2tlbn0iLCJ4LXRhZ29pby1yZWdpb24iOiJ1cy1lMSJ9LCJpbnB1dHMiOlt7ImlkIjoidGFnb2lvLXRva2VuIiwidHlwZSI6InByb21wdFN0cmluZyIsImRlc2NyaXB0aW9uIjoiRW50ZXIgeW91ciBUYWdvSU8gUHJvZmlsZSBUb2tlbiAoQmVhcmVyIGZvcm1hdCkiLCJwYXNzd29yZCI6dHJ1ZX1dfQ==)

## Features

- **Remote Server**: Connect instantly via `https://mcp.ai.tago.io` — no local setup required
- **Device Management**: Search, create, update, configure, and delete devices — with guarded credential rotation
- **Device Data**: Read (including aggregations), send, edit, and delete stored data
- **Automation**: Search and manage actions
- **Entities**: Create and manage entities, evolve their schemas and indexes, and read, send, edit, and delete index-queried entity data
- **TagoRUN Users**: Manage Run users and their notifications, and mint short-lived login tokens for debugging an application as a specific user
- **Analysis Development**: Create and manage analyses, upload and download scripts, trigger runs, and read console output
- **Dashboards & Widgets**: Create and manage dashboards and their widgets with schema-validated configurations and explicit layout control
- **Custom Widgets**: Read and upload the `.tsx` source code behind custom (iframe) widgets, with platform bundling and a fix-and-reupload development loop
- **Platform Teaching**: Built-in platform overview, search and retrieval over the official docs, and code examples from the public snippets catalog
- **Account Insight**: Profile info, resource limits, usage statistics, and secrets metadata
- **Dual Protocol Support**: STDIO (default) and HTTP Streamable transport protocols

## Tools

Every tool is single-purpose with accurate read/write annotations. Resource-list search tools (devices, actions, analyses, dashboards, entities, run users, secrets) support filtering, pagination, field selection, and a `response_format` of `concise` (default) or `detailed` — selecting `fields` also controls the rendered columns (explicit fields render exactly those fields even in concise mode; without them, concise mode shows the default columns and detailed mode shows everything); connector and network searches take their `name`/`public` filters as top-level parameters. The docs search uses a specialized `query` input, and the code-example search takes `query` + `type` (plus an optional `runtime` for Analysis examples).

| Domain | Tools |
|---|---|
| Devices | `search_devices`, `get_device`, `create_device`, `update_device`, `delete_device`, `configure_device` |
| Device data | `read_device_data`, `send_device_data`, `edit_device_data`, `delete_device_data` |
| Actions | `search_actions`, `get_action`, `create_action`, `update_action`, `delete_action` |
| Analyses | `search_analyses`, `get_analysis`, `create_analysis`, `update_analysis`, `delete_analysis`, `upload_analysis_script`, `download_analysis_script`, `run_analysis`, `read_analysis_console` |
| Dashboards & widgets | `search_dashboards`, `get_dashboard`, `create_dashboard`, `update_dashboard`, `delete_dashboard`, `get_widget`, `create_widget`, `update_widget`, `delete_widget`, `widget_schema_lookup`, `validate_widget_configuration`, `get_custom_widget_code`, `upload_custom_widget_code` |
| Entities | `search_entities`, `get_entity`, `create_entity`, `update_entity`, `delete_entity`, `update_entity_schema` |
| Entity data | `read_entity_data`, `send_entity_data`, `edit_entity_data`, `delete_entity_data`, `empty_entity_data` |
| Run users | `search_run_users`, `get_run_user`, `create_run_user`, `update_run_user`, `delete_run_user`, `login_as_run_user` |
| Run-user notifications | `read_run_user_notifications`, `send_run_user_notification`, `update_run_user_notification`, `delete_run_user_notification` |
| Profile | `get_profile`, `get_profile_limits`, `get_profile_statistics`, `search_secrets` |
| Connectors & networks | `search_connectors`, `get_connector`, `search_networks`, `get_network` |
| Docs & examples | `platform_overview`, `search_docs`, `read_doc`, `search_code_examples`, `get_code_example` |

### Migrating from v3

Version 4 replaces the multi-operation tools (`operation` parameters) with the single-purpose tools above. Mapping from the old surface:

| v3 tool + operation | v4 tool |
|---|---|
| `device-operations` + `lookup` (list) | `search_devices` |
| `device-operations` + `lookup` (with `deviceID`) | `get_device` |
| `device-operations` + `create` | `create_device` — connector is now **required** (no hidden defaults); network is validated or derived from the connector |
| `device-operations` + `update` | `update_device` — connector/network/serial changes now require `confirm_token_rotation: true` and rotate **all** device tokens, returning the replacements |
| `device-operations` + `delete` | `delete_device` |
| `device-operations` + `configure` | `configure_device` |
| `device-data-operations` + `read` | `read_device_data` |
| `device-data-operations` + `create` | `send_device_data` |
| `device-data-operations` + `update` | `edit_device_data` |
| `device-delete-data` | `delete_device_data` |
| `action-operations` + `lookup` / `create` / `update` / `delete` | `search_actions` / `get_action` (with `actionID`), `create_action`, `update_action`, `delete_action` |
| `analysis-lookup` | `search_analyses`, `get_analysis` |
| `entity-operations` | `search_entities`, `get_entity` |
| `run-user-lookup` | `search_run_users`, `get_run_user` |
| `profile-metrics` (`limits` / `statistics`) | `get_profile_limits` / `get_profile_statistics` |
| `profile-lookup` (`profile_info` / `secrets_list`) | `get_profile` / `search_secrets` |
| `connector-network-lookup` | `search_connectors`, `get_connector`, `search_networks`, `get_network` |
| `tagoio-documentation-search` | **removed** — use `search_docs` + `read_doc` (official docs index) |
| `tagoio-code-search` | `search_code_examples` — now searches TagoIO's public snippets catalog and takes a single `query` instead of `search[]` |

Parameter conventions also changed: resource IDs are snake_case (`device_id`, not `deviceID`), and wildcard name matching is applied automatically by the server.

### Analysis development

The analysis tools cover the full development loop: create an analysis, upload its script, trigger a run, and read its console output. New analyses are created hosted on TagoIO with runtime `node-rt2025` (default), `python-rt2025`, or `deno-rt2025`; existing analyses on other runtimes remain readable. The runtime and run location cannot be changed through `update_analysis`. Scripts upload as plain UTF-8 text with a 1 MiB cap, and downloads return at most 1 MiB of source — the server never exposes signed storage URLs or analysis tokens, and environment variable values are write-only (they are never echoed back). `run_analysis` triggers execution asynchronously; a success result only means the run started. `read_analysis_console` returns a bounded tail (the last 200 entries / 64 KiB) of the stored console output. The account credential is redacted from every tool result and error — including script downloads and console output that happen to contain it. Code examples come from the public snippets catalog at `snippets.tago.io`, fetched without sending any account credential; each example lookup runs under a single 10-second deadline and search results are size-bounded with explicit truncation notes. Example search is honest about coverage: results that match only part of a multi-term query are labeled partial, queries with no adequately matching example say so explicitly, and results never invite inferring API routes or behavior an example does not demonstrate.

### Dashboards and widgets

Widget and dashboard configurations are validated locally against the official dashboard schema package before any API call (for dashboard creation this includes the profile lookup) — invalid configurations fail with the exact issue paths and never reach the platform, and there is no way to bypass validation. `widget_schema_lookup` returns the exact JSON Schema for any of the 40 validator-supported widget types; call it before creating or repairing a widget, and use `validate_widget_configuration` to check a draft configuration locally (create or update mode) without touching your account — mutation-time validation still runs regardless. Widgets are created unplaced — placement lives in the dashboard `arrangement`, changed only through `update_dashboard` (send the complete desired arrangement), and a widget still referenced by the arrangement cannot be deleted. Updates are patches: you supply only what changes, the server fetches the current state, merges it (arrays replace atomically, an explicit `null` clears a nullable field, an empty array clears a collection), and revalidates the full result before sending. Dashboard updates send only the changed paths, with no schema-injected defaults; widget updates send each changed top-level object in complete merged form (the platform replaces those objects wholesale on update, so sibling fields are never lost) and keep the widget's linked Analysis attached unless you explicitly change or clear it. Stored layout state round-trips: `arrangement[].tab` and `tabs[].hidden` may be `null`. The widget `type` is immutable after creation, and duplicate dashboard tab keys are always rejected.

### Custom widgets

A custom widget is an `iframe` widget whose code is a single `.tsx` React component stored in your profile's TagoIO Files storage; the platform bundles it on upload and the dashboard renders the bundled build. The development loop is create (`create_widget` with `type` `"iframe"` and `display.url` `""`) → author → `upload_custom_widget_code` → place via the dashboard arrangement. `get_custom_widget_code` reads the current source fresh (never CDN-stale) and reports whether a bundled build exists; a widget with no source yet gets bootstrap guidance instead of an error. Uploads take plain UTF-8 `.tsx` only (the extension is fixed, never a caller input) with a 1 MiB cap enforced before any request, and every bundle outcome is reported distinctly — a bundle failure is a **fixable caveat**: the source is still saved and the widget keeps rendering the previous successful build while you fix and re-upload. Deployments without the bundler (and per-minute upload rate limits: free 1 / starter 10 / scale 30) are reported in plain terms. The validation adapter tolerates the platform-managed `display.artifact_url` on updates and preserves it on the wire (the pinned schema package does not model it yet), so unrelated `update_widget` patches on a bundled widget just work. The authoring contract — provider wrapper, exact `npm:` pins, the `// tailwind` marker, forbidden constructs, and worked examples — is taught by the bundled skill at [`skills/custom-widget-development/SKILL.md`](skills/custom-widget-development/SKILL.md).

### Entities and entity data

Entities are schema-defined tabular stores: every entity has typed fields (`string`, `text`, `int`, `float`, `json`, `timestamp`) and one or more indexes, and querying is index-coupled — `read_entity_data` filters must form a left-to-right prefix of one of the entity's indexes, and ordering is ascending/descending on the chosen index's last field. The tools enforce the platform's real limits, which are stricter than the SDK types suggest: reads return 1–10,000 rows (default 20), writes accept up to 100 rows per call with per-type value caps, `send_entity_data` upserts when a row includes an existing `id`, and `delete_entity_data` takes explicit row IDs with a hard cap of 10 per request — `empty_entity_data` is the supported way to clear an entire entity. Schema evolution goes through `update_entity_schema` as an explicit changeset (add/rename/delete fields, toggle `required`, add/delete indexes); a field's **type can never change** after creation (the platform has no such operation — create a new field and migrate instead), and the reserved `id`, `created_at`, and `updated_at` fields are managed by the platform.

### Run users

The Run-user tools manage TagoRUN end users: create (users default to inactive unless `active: true`), update (email is immutable), delete, and per-user notifications. Passwords are write-only inputs — they are never echoed back in results or errors. `login_as_run_user` mints a temporary login token for debugging the application from a specific user's perspective; because minted login tokens cannot be revoked individually, the expiry is clamped hard — `"never"` is refused and the ceiling is 2 hours (default 1 hour) — and killing an existing token requires deactivating or deleting the user. Deliberately out of scope: TagoRUN environment administration (`run.info`/`run.edit`, SSO and custom-domain settings), test emails, and anonymous-user creation.

## Quick Start

1. **Get a token** — Go to [TagoIO Profile Settings](https://admin.tago.io/profile) and generate a Profile Token
2. **Pick your setup** — [Remote Server](#remote-server-recommended) (recommended) or [Local Server](#local-server)
3. **Configure your platform** — Find your IDE or AI tool below and copy the config

## Prerequisites

- TagoIO account with a valid Profile Token ([generate one here](https://admin.tago.io/profile))
- Node.js 22.12+ ([download](https://nodejs.org/en/download/)) — only required for the [Local Server](#local-server) setup

## Remote Server (Recommended)

Connect directly to the TagoIO hosted MCP server at `https://mcp.ai.tago.io`. No local installation or Node.js required.

Authentication is done via the `Authorization` header with your Profile Token.

**Region:** Requests default to US East (`us-e1`). To connect to a different region, add the `x-tagoio-region` header:

| Header | Value |
|---|---|
| `x-tagoio-region` | `us-e1` (US East, default) |
| `x-tagoio-region` | `eu-w1` (EU West) |

Only these region codes are accepted — arbitrary URLs or hosts are rejected. For dedicated TagoDeploy instances, run the server yourself (stdio mode) and point it at your instance with the `TAGOIO_API` environment variable (`https://` only); the endpoint is operator configuration, never request input.

---

### VS Code

Add to `.vscode/mcp.json` in your project (or User Settings for global access):

```json
{
  "servers": {
    "@tago-io/mcp": {
      "type": "http",
      "url": "https://mcp.ai.tago.io",
      "headers": {
        "Authorization": "Bearer ${input:tagoToken}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "tagoToken",
      "description": "TagoIO Profile Token",
      "password": true
    }
  ]
}
```

### VS Code Insiders

Same configuration as [VS Code](#vs-code). Add to `.vscode/mcp.json` or User Settings.

### Claude Code

```bash
claude mcp add-json @tago-io/mcp '{"type":"http","url":"https://mcp.ai.tago.io","headers":{"Authorization":"Bearer YOUR-TAGOIO-TOKEN"}}'
```

### Claude Desktop

Claude Desktop does not natively support HTTP transport. Use the `mcp-remote` bridge:

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "@tago-io/mcp": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.ai.tago.io",
        "--header",
        "Authorization: Bearer YOUR-TAGOIO-TOKEN"
      ]
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "@tago-io/mcp": {
      "url": "https://mcp.ai.tago.io",
      "headers": {
        "Authorization": "Bearer YOUR-TAGOIO-TOKEN"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "@tago-io/mcp": {
      "serverUrl": "https://mcp.ai.tago.io",
      "headers": {
        "Authorization": "Bearer YOUR-TAGOIO-TOKEN"
      }
    }
  }
}
```

### JetBrains IDEs

Go to **Settings** > **Tools** > **AI Assistant** > **Model Context Protocol (MCP)** and add a new server with this JSON:

```json
{
  "servers": {
    "@tago-io/mcp": {
      "url": "https://mcp.ai.tago.io",
      "requestInit": {
        "headers": {
          "Authorization": "Bearer YOUR-TAGOIO-TOKEN"
        }
      }
    }
  }
}
```

### GitHub Copilot

Add to `.vscode/mcp.json` (VS Code) or configure via CLI:

```json
{
  "servers": {
    "@tago-io/mcp": {
      "type": "http",
      "url": "https://mcp.ai.tago.io",
      "headers": {
        "Authorization": "Bearer ${input:tagoToken}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "tagoToken",
      "description": "TagoIO Profile Token",
      "password": true
    }
  ]
}
```

### Google Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "@tago-io/mcp": {
      "httpUrl": "https://mcp.ai.tago.io",
      "headers": {
        "Authorization": "Bearer YOUR-TAGOIO-TOKEN"
      }
    }
  }
}
```

### Amazon Q CLI

Add to `~/.aws/amazonq/mcp.json`:

```json
{
  "mcpServers": {
    "@tago-io/mcp": {
      "url": "https://mcp.ai.tago.io",
      "headers": {
        "Authorization": "Bearer YOUR-TAGOIO-TOKEN"
      }
    }
  }
}
```

### OpenAI Agents / ChatGPT

In the OpenAI Agent Builder or ChatGPT MCP settings:

- **Server URL**: `https://mcp.ai.tago.io`
- **Protocol**: Streamable HTTP
- **Authentication**: Add `Authorization: Bearer YOUR-TAGOIO-TOKEN` header

### Warp

Warp does not natively support HTTP transport. Use the `mcp-remote` bridge.

Add to `~/.warp/mcp.json`:

```json
{
  "mcpServers": {
    "@tago-io/mcp": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.ai.tago.io",
        "--header",
        "Authorization: Bearer YOUR-TAGOIO-TOKEN"
      ]
    }
  }
}
```

### Kiro

Kiro does not natively support HTTP transport. Use the `mcp-remote` bridge.

Add to `.kiro/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "@tago-io/mcp": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.ai.tago.io",
        "--header",
        "Authorization: Bearer YOUR-TAGOIO-TOKEN"
      ]
    }
  }
}
```

## Local Server

Run the MCP server locally via `npx`. Useful for offline development, air-gapped environments, or custom setups.

Requires **Node.js 22.12+** installed ([download](https://nodejs.org/en/download/)).

### STDIO Transport (Default)

Best for desktop AI assistants and IDEs. Add this configuration to your platform's config file (see [Configuration Paths](#configuration-paths)):

```json
{
  "mcpServers": {
    "@tago-io/mcp": {
      "command": "npx",
      "args": ["-y", "@tago-io/mcp-server"],
      "env": {
        "TAGOIO_TOKEN": "YOUR-TAGOIO-TOKEN"
      }
    }
  }
}
```

For **Claude Code**, use the CLI:

```bash
claude mcp add @tago-io/mcp-server -e TAGOIO_TOKEN=YOUR-TAGOIO-TOKEN -- npx -y @tago-io/mcp-server
```

For **VS Code / GitHub Copilot**, use the `inputs` pattern for secure token prompting:

```json
{
  "servers": {
    "@tago-io/mcp": {
      "command": "npx",
      "args": ["-y", "@tago-io/mcp-server"],
      "env": {
        "TAGOIO_TOKEN": "${input:tagoToken}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "tagoToken",
      "description": "TagoIO Profile Token",
      "password": true
    }
  ]
}
```

### HTTP Streamable Transport

For web-based AI platforms or when you need multiple clients connecting simultaneously:

```bash
# Start on default port 3000
npx -y @tago-io/mcp-server http

# Or pick a custom port
MCP_PORT=8080 npx -y @tago-io/mcp-server http
```

Your server will be available at `http://localhost:3000`.

**Authentication:** Pass your TagoIO token in the `Authorization` header:
```
Authorization: Bearer YOUR-TAGOIO-TOKEN
```

In HTTP mode, each request carries its own token — no `TAGOIO_TOKEN` environment variable needed. Multiple clients with different credentials can connect at the same time.

**Health check:** `GET /health` returns the server name, version, and status.

### Configuration Paths

| Platform | Config File Path |
|---|---|
| **VS Code / GitHub Copilot** | `.vscode/mcp.json` or User Settings |
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |
| **Claude Code** | Managed via `claude mcp add` CLI |
| **Cursor** | `~/.cursor/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **JetBrains IDEs** | Settings > Tools > AI Assistant > MCP |
| **Google Gemini CLI** | `~/.gemini/settings.json` |
| **Warp** | `~/.warp/mcp.json` |
| **Amazon Q CLI** | `~/.aws/amazonq/mcp.json` |
| **Kiro** | `.kiro/mcp.json` (project-level) |

## Authentication

The MCP server accepts three kinds of TagoIO tokens, classified by prefix:

- **Profile Token (`p-…`, recommended for getting started):** Go to [TagoIO Profile Settings](https://admin.tago.io/profile) and generate a new token. This grants full access to your profile.
- **Analysis Token (`a-…`, for restricted access):** Go to **Analysis** > select your analysis > copy the token. Your analysis must be set to run "External". This limits the MCP server to only the resources the analysis can reach — ideal for production or shared environments where you want to control access via IAM.
- **Device Token (unprefixed, device-data only):** a single device's token. Only the device-data tools (`read_device_data`, `send_device_data`, `edit_device_data`, `delete_device_data`) work with it, scoped to that one device; account-level tools (search, create, actions, profile, …) will fail with permission errors.

Tokens with any other prefix are rejected at authentication. Replace `YOUR-TAGOIO-TOKEN` in any configuration above with your chosen token.

## API Endpoints

The server connects to these TagoIO regions:

- **US East**: `https://api.us-e1.tago.io` (default)
- **EU West**: `https://api.eu-w1.tago.io`

**How to set the region:**

| Setup | Method |
|---|---|
| Remote Server | `x-tagoio-region` header — `us-e1` or `eu-w1` only |
| Local STDIO | `TAGOIO_API` environment variable (e.g., `https://api.eu-w1.tago.io`) |
| Local HTTP | `x-tagoio-region` header (same as Remote Server: short codes only) |

The HTTP header accepts only the short region codes above — full URLs or hosts are rejected with HTTP 400. For dedicated TagoDeploy instances, run the server locally in STDIO mode and set `TAGOIO_API` to your instance's API URL (`https://` only); the endpoint is operator configuration, never request input.

## Troubleshooting

### Connection Failed

- Check that your token is valid — Profile Tokens live at [TagoIO Profile Settings](https://admin.tago.io/profile); Analysis and Device tokens are found on the analysis or device itself (see [Authentication](#authentication))
- Ensure correct API endpoint for your region
- For the remote server, verify `https://mcp.ai.tago.io` is reachable

### Authentication Error

- Confirm your token has the necessary permissions
- Verify the token format — use `Bearer YOUR-TOKEN` in the `Authorization` header (HTTP) or the `TAGOIO_TOKEN` env var (STDIO)

### Data Access Issues

- Check device permissions in your TagoIO account
- Ensure devices have recent data available

### mcp-remote Bridge Issues

If using `mcp-remote` for Claude Desktop, Warp, or Kiro:

- Ensure Node.js 22.12+ is installed (required for `npx`)
- Check that `mcp-remote` can reach `https://mcp.ai.tago.io`
- Try running `npx -y mcp-remote https://mcp.ai.tago.io --header "Authorization: Bearer YOUR-TOKEN"` manually to verify connectivity

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Need Help?** Visit the [TagoIO Documentation](https://docs.tago.io) or contact our support team.
