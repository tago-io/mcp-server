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
- **Device Management**: Access device information, configurations, and real-time data
- **Data Analysis**: Perform statistical operations (sums, averages, reports) on stored data
- **Platform Integration**: Retrieve users, actions, analysis scripts, and account statistics
- **Code Generation**: AI-powered TagoIO Analysis script generation with proper context
- **Development Support**: Debug assistance and tag relationship analysis
- **Dual Protocol Support**: STDIO (default) and HTTP Streamable transport protocols

## Available Tools

The server exposes 12 tools across 8 service areas. Every tool returns Markdown-formatted output.

### Devices

#### `device-operations`

Manages IoT device entities (not the data stored within them). Supports five operations:

| Operation | Description | Required params |
|---|---|---|
| `lookup` | List devices or get a single device by ID | `deviceID` or `lookupDevice.filter` |
| `create` | Provision a new device | `createDevice.name`, `createDevice.type` |
| `update` | Modify an existing device | `deviceID`, `updateDevice` |
| `delete` | Permanently remove a device and all its data | `deviceID` |
| `configure` | Set or update configuration parameters | `deviceID`, `configureDevice.configuration_params` |

Lookup supports filters: `name` (wildcard), `active`, `type` (`mutable`/`immutable`), `tags`, `connector`, `network`. When a lookup resolves to a single device, `include_data_amount` and `include_configuration_params` are available.

Create supports: `name`, `type`, `connector`, `network`, `tags`, `description`, `active`, `serie_number`, `chunk_period` (immutable), `chunk_retention` (immutable), `configuration_params`, `payload_decoder`. Device type cannot be changed after creation.

#### `device-data-operations`

CRUD for data records stored within a device. Mutable devices support all three operations; immutable devices support `create` and `read` only. Variable names must be snake_case.

| Operation | Description | Required params |
|---|---|---|
| `create` | Send data points to a device | `deviceID`, `createData[]` |
| `update` | Edit existing records by ID | `deviceID`, `editData[]` |
| `read` | Retrieve data with flexible query strategies | `deviceID` |

Each data point in `createData` / `editData` accepts: `variable`, `value`, `unit`, `group`, `location` (`{ lat, lng }`), `metadata`, `time`.

The `read` operation accepts a `query` object with:

- **`query`** (type) — `default`, `last_item`, `last_value`, `last_location`, `last_insert`, `first_item`, `first_value`, `first_location`, `first_insert`, `min`, `max`, `count`, `avg`, `sum`, `aggregate`, `conditional`. Aggregation queries (`min`/`max`/`count`/`avg`/`sum`) require `start_date` and a window of at most one month.
- **Common filters** — `variables`, `groups`, `ids`, `values`, `start_date`, `end_date`, `qty` (1–10,000, default 15), `ordination`, `skip`
- **Aggregate** — additionally requires `interval` (`minute`/`hour`/`day`/`month`/`quarter`/`year`) and `function` (`avg`/`sum`/`min`/`max`)
- **Conditional** — additionally requires `start_date`, `value` (number), and `function` (`gt`/`gte`/`lt`/`lte`/`eq`/`ne`)

#### `device-delete-data`

Deletes data records from a mutable device. Will fail on immutable devices. Filter params apply per variable — `qty: 2` deletes 2 records from each listed variable.

| Param | Type | Description |
|---|---|---|
| `deviceID` | string | Required. 24-char device ID. |
| `query.variables` | string[] | Variable names to target. |
| `query.groups` | string[] | Group names to target. |
| `query.ids` | string[] | Specific record IDs to delete. |
| `query.start_date` / `end_date` | string | ISO 8601 date range. |
| `query.qty` | number | Max records to delete per variable. |
| `query.skip` | number | Records to skip before deleting. |

---

### Actions

#### `action-operations`

CRUD for automation actions — workflows that fire responses when triggers occur.

| Operation | Description | Required params |
|---|---|---|
| `lookup` | List actions or get one by ID | `actionID` or `lookupAction.filter` |
| `create` | Define a new action | `createAction.name`, `createAction.type`, `createAction.action` |
| `update` | Modify an existing action | `actionID`, `updateAction` |
| `delete` | Remove an action | `actionID` |

**Trigger types** (`createAction.type`): `condition`, `resource`, `interval`, `schedule`, `mqtt_topic`, `usage_alert`, `condition_geofence`

**Action types** (`createAction.action.type`): `script`, `notification`, `notification_run`, `email`, `sms`, `mqtt`, `post`, `sms-twilio`, `whatsapp-twilio`, `email-sendgrid`, `email-smtp`, `queue-sqs`

When targeting multiple devices, prefer `tag_key` / `tag_value` triggers over specific resource IDs. Actions that use Secrets require the Secret ID — retrieve it with `profile-lookup`.

---

### Analysis

#### `analysis-lookup`

Read-only lookup for analysis configurations (serverless scripts running Node.js or Python on TagoIO).

| Param | Type | Description |
|---|---|---|
| `operation` | enum | Must be `"lookup"`. |
| `analysisID` | string | Optional. Returns full detail when present. |
| `lookupAnalysis.filter.name` | string | Wildcard name search. |
| `lookupAnalysis.filter.runtime` | enum | `node` or `python` |
| `lookupAnalysis.filter.run_on` | enum | `tago` or `external` |
| `lookupAnalysis.filter.tags` | array | Key/value tag filter. |
| `lookupAnalysis.filter.include_console` | boolean | Include console output. Only for console-specific queries. |

---

### Entities

#### `entity-operations`

Read-only lookup for TagoIO Entities — the next-generation database replacing Mutable Devices for complex structured data. Returns entity metadata and schema, not the data records stored within.

| Param | Type | Description |
|---|---|---|
| `operation` | enum | Must be `"lookup"`. |
| `entityID` | string | Optional. Returns full detail when present. |
| `lookupEntity.filter.id` | string | Exact 24-char entity ID. |
| `lookupEntity.filter.name` | string | Wildcard name search. |
| `lookupEntity.filter.tags` | array | Key/value tag filter. |

---

### Run Users

#### `run-user-lookup`

Look up users in TagoRUN — TagoIO's limited-access portal for end users.

| Param | Type | Description |
|---|---|---|
| `runUserID` | string | Optional. Returns full detail when present. |
| `lookupUser.filter.name` | string | Wildcard name search. |
| `lookupUser.filter.email` | string | Wildcard email search. |
| `lookupUser.filter.active` | boolean | Filter by active status. |
| `lookupUser.filter.tags` | array | Key/value tag filter. |

---

### Profile

#### `profile-metrics`

Returns resource limits or time-series usage statistics for the current profile. All metrics are monthly.

| Param | Type | Description |
|---|---|---|
| `type` | enum | `limits` — allocation vs. usage. `statistics` — time-series data. |
| `statisticsQuery.start_date` | string | ISO 8601. Only for `statistics`. |
| `statisticsQuery.end_date` | string | ISO 8601. Defaults to now. |
| `statisticsQuery.periodicity` | enum | `day`, `month`, or `year`. |

#### `profile-lookup`

Returns profile information or lists stored secrets (credentials for Twilio, SendGrid, SMTP, SQS integrations).

| Param | Type | Description |
|---|---|---|
| `operation` | enum | `profile_info` or `secrets_list` |
| `secrets_query.filter.id` | string | Filter secrets by ID. |
| `secrets_query.filter.key` | string | Filter secrets by key name. |
| `secrets_query.orderBy` | enum | `created_at`, `updated_at`, or `key` |

---

### Integration

#### `connector-network-lookup`

Finds connectors (protocol decoders) and networks (communication integrations) by ID or name. Accepts multiple queries in a single call. Returns at most 10 results per query.

| Param | Type | Description |
|---|---|---|
| `query` | array | Array of query objects, each resolved independently. |
| `query[].type` | enum | `connector` or `network` |
| `query[].id` | string | Exact 24-char ID for direct lookup. |
| `query[].name` | string | Partial name for wildcard search. |
| `query[].public` | boolean | `false` returns only account-owned resources. |

---

### Documentation

#### `tagoio-documentation-search`

Queries TagoIO's documentation knowledge base and returns relevant articles and links. Use when users ask about platform features, widget configuration, APIs, or TagoIO-specific concepts.

| Param | Type | Description |
|---|---|---|
| `search` | string[] | 1 to 5 search questions. Precise queries return better results. |

#### `tagoio-code-search`

Returns JavaScript code examples and SDK guidance for Analysis scripts and Payload Parsers. Analysis scripts are single-file serverless Node.js functions (no package.json). External libraries require webpack bundling via `@tago-io/builder`.

| Param | Type | Description |
|---|---|---|
| `search` | string[] | 1 to 5 search questions. |
| `type` | enum | `analysis` or `payload-parser` |

---

## Quick Start

1. **Get a token** — Go to [TagoIO Profile Settings](https://admin.tago.io/profile) and generate a Profile Token
2. **Pick your setup** — [Remote Server](#remote-server-recommended) (recommended) or [Local Server](#local-server)
3. **Configure your platform** — Find your IDE or AI tool below and copy the config

## Prerequisites

- TagoIO account with a valid Profile Token ([generate one here](https://admin.tago.io/profile))
- Node.js 22+ ([download](https://nodejs.org/en/download/)) — only required for the [Local Server](#local-server) setup

## Remote Server (Recommended)

Connect directly to the TagoIO hosted MCP server at `https://mcp.ai.tago.io`. No local installation or Node.js required.

Authentication is done via the `Authorization` header with your Profile Token.

**Region:** Requests default to US East (`us-e1`). To connect to a different region, add the `x-tagoio-region` header:

| Header | Value |
|---|---|
| `x-tagoio-region` | `eu-w1` (EU West) |
| `x-tagoio-region` | `https://api.your-instance.tagoio.net` (dedicated instance) |

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

Requires **Node.js 22+** installed ([download](https://nodejs.org/en/download/)).

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

The MCP server accepts two types of TagoIO tokens:

- **Profile Token (recommended for getting started):** Go to [TagoIO Profile Settings](https://admin.tago.io/profile) and generate a new token. This grants full access to your profile.
- **Analysis Token (for restricted access):** Go to **Analysis** > select your analysis > copy the token. Your analysis must be set to run "External". This limits the MCP server to only the resources the analysis can reach — ideal for production or shared environments where you want to control access via IAM.

Replace `YOUR-TAGOIO-TOKEN` in any configuration above with your chosen token.

## API Endpoints

The server connects to these TagoIO regions:

- **US East**: `https://api.us-e1.tago.io` (default)
- **EU West**: `https://api.eu-w1.tago.io`

Dedicated TagoIO instances are also supported — pass your full API URL as the region value.

**How to set the region:**

| Setup | Method |
|---|---|
| Remote Server | `x-tagoio-region` header (e.g., `eu-w1` or full URL) |
| Local STDIO | `TAGOIO_API` environment variable (e.g., `https://api.eu-w1.tago.io`) |
| Local HTTP | `x-tagoio-region` header (same as Remote Server) |

## Troubleshooting

### Connection Failed

- Check your Profile Token is valid at [TagoIO Profile Settings](https://admin.tago.io/profile)
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

- Ensure Node.js 22+ is installed (required for `npx`)
- Check that `mcp-remote` can reach `https://mcp.ai.tago.io`
- Try running `npx -y mcp-remote https://mcp.ai.tago.io --header "Authorization: Bearer YOUR-TOKEN"` manually to verify connectivity

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Need Help?** Visit the [TagoIO Documentation](https://docs.tago.io) or contact our support team.
