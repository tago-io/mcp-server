<br/>

<p align="center">
  <img src="https://assets.tago.io/tagoio/tagoio.png" width="200px" alt="TagoIO"></img>
</p>

# TagoIO | MCP Server

Connect your AI assistant to your TagoIO devices, data, and platform resources, from your IDE or AI tool.

[![Install in VS Code](https://img.shields.io/badge/Install_in-VS_Code-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=%40tago-io%2Fmcp&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.ai.tago.io%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22%24%7Binput%3Atagoio-token%7D%22%2C%22x-tagoio-region%22%3A%22us-e1%22%7D%2C%22inputs%22%3A%5B%7B%22id%22%3A%22tagoio-token%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Enter%20your%20TagoIO%20Profile%20Token%20(Bearer%20format)%22%2C%22password%22%3Atrue%7D%5D%7D)
[![Install in VS Code Insiders](https://img.shields.io/badge/Install_in-VS_Code_Insiders-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=%40tago-io%2Fmcp&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.ai.tago.io%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22%24%7Binput%3Atagoio-token%7D%22%2C%22x-tagoio-region%22%3A%22us-e1%22%7D%2C%22inputs%22%3A%5B%7B%22id%22%3A%22tagoio-token%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Enter%20your%20TagoIO%20Profile%20Token%20(Bearer%20format)%22%2C%22password%22%3Atrue%7D%5D%7D&quality=insiders)
[![Install in Visual Studio](https://img.shields.io/badge/Install_in-Visual_Studio-C16FDE?style=flat-square&logo=visualstudio&logoColor=white)](https://vs-open.link/mcp-install?%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.ai.tago.io%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22%24%7Binput%3Atagoio-token%7D%22%2C%22x-tagoio-region%22%3A%22us-e1%22%7D%2C%22inputs%22%3A%5B%7B%22id%22%3A%22tagoio-token%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Enter%20your%20TagoIO%20Profile%20Token%20(Bearer%20format)%22%2C%22password%22%3Atrue%7D%5D%7D)
[![Install in Cursor](https://img.shields.io/badge/Install_in-Cursor-000000?style=flat-square&logoColor=white)](https://cursor.com/en/install-mcp?name=%40tago-io%2Fmcp&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHBzOi8vbWNwLmFpLnRhZ28uaW8iLCJoZWFkZXJzIjp7IkF1dGhvcml6YXRpb24iOiIke2lucHV0OnRhZ29pby10b2tlbn0iLCJ4LXRhZ29pby1yZWdpb24iOiJ1cy1lMSJ9LCJpbnB1dHMiOlt7ImlkIjoidGFnb2lvLXRva2VuIiwidHlwZSI6InByb21wdFN0cmluZyIsImRlc2NyaXB0aW9uIjoiRW50ZXIgeW91ciBUYWdvSU8gUHJvZmlsZSBUb2tlbiAoQmVhcmVyIGZvcm1hdCkiLCJwYXNzd29yZCI6dHJ1ZX1dfQ==)
[![Add to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=%40tago-io%2Fmcp&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHBzOi8vbWNwLmFpLnRhZ28uaW8iLCJoZWFkZXJzIjp7IkF1dGhvcml6YXRpb24iOiIke2lucHV0OnRhZ29pby10b2tlbn0iLCJ4LXRhZ29pby1yZWdpb24iOiJ1cy1lMSJ9LCJpbnB1dHMiOlt7ImlkIjoidGFnb2lvLXRva2VuIiwidHlwZSI6InByb21wdFN0cmluZyIsImRlc2NyaXB0aW9uIjoiRW50ZXIgeW91ciBUYWdvSU8gUHJvZmlsZSBUb2tlbiAoQmVhcmVyIGZvcm1hdCkiLCJwYXNzd29yZCI6dHJ1ZX1dfQ==)

---

## What you get

Read and write your TagoIO account from an AI assistant, over 81 single-purpose tools:

- **Devices and data**: manage devices with guarded credential rotation, and read, send, edit, and delete their data
- **Actions**: search and manage automations
- **Analyses**: manage analyses, upload and download scripts, trigger runs, read console output
- **Dashboards and widgets**: schema-validated configuration with explicit layout control, including the `.tsx` source behind custom widgets
- **Entities**: manage entities, evolve schemas and indexes, read and write index-queried rows
- **TagoRUN users**: manage users and notifications, and mint short-lived tokens to debug the app as a given user
- **Access management**: revise the policies that let analyses and TagoRUN users reach resources they do not own, and look up the grant a denied operation needs
- **Files, profile, and docs**: clean up stored files, read limits and usage, search the official docs and code examples

Your account credential never leaves the server; see [Tools](#tools).

## Quick Start

1. **Get a token.** Generate a Profile Token in [TagoIO Profile Settings](https://admin.tago.io/profile).
2. **Pick a setup.** [Remote server](#remote-server-recommended) needs nothing installed. [Local server](#local-server) runs it yourself over `npx`.
3. **Configure your client.** Find your IDE or AI tool under [Client setup](#client-setup) and copy the config.

The remote server is the fastest way in. Use the local server for offline work, air-gapped networks, or a dedicated TagoDeploy instance.

## Prerequisites

- A TagoIO account and a Profile Token ([generate one](https://admin.tago.io/profile))
- Node.js 22.12 or newer ([download](https://nodejs.org/en/download/)), for the local server only

## Remote Server (Recommended)

Point your client at the TagoIO hosted server, `https://mcp.ai.tago.io`. Nothing to install, no Node.js.

Authenticate with your Profile Token in the `Authorization` header. Requests default to US East; see [Regions and endpoints](#regions-and-endpoints) to reach EU West.

Copy the config for your client from [Client setup](#client-setup).

## Local Server

Run the server yourself with `npx`. Requires Node.js 22.12 or newer.

```bash
npx -y @tago-io/mcp-server        # STDIO transport (default)
npx -y @tago-io/mcp-server http   # HTTP Streamable transport
```

Run `npx -y @tago-io/mcp-server --help` for the transport list.

### STDIO transport

The default, and what desktop assistants and IDEs expect. The token comes from the environment:

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

For Claude Code:

```bash
claude mcp add @tago-io/mcp-server -e TAGOIO_TOKEN=YOUR-TAGOIO-TOKEN -- npx -y @tago-io/mcp-server
```

For VS Code and GitHub Copilot, prompt for the token instead of storing it:

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

### HTTP Streamable transport

For web-based AI platforms, or several clients at once:

```bash
npx -y @tago-io/mcp-server http              # port 3000
MCP_PORT=8080 npx -y @tago-io/mcp-server http
```

The server listens on `http://localhost:3000` by default. Each request carries its own token in the `Authorization` header, so no `TAGOIO_TOKEN` is needed and clients with different credentials can connect at the same time.

`GET /health` returns the server name, version, and status.

## Client Setup

Every config below targets the remote server. To point one at a local HTTP server instead, swap the URL for `http://localhost:3000`.

| Client | Config file |
|---|---|
| [VS Code / GitHub Copilot](#vs-code) | `.vscode/mcp.json` or User Settings |
| [Claude Code](#claude-code) | `claude mcp add-json` CLI |
| [Claude Desktop](#claude-desktop) | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |
| [Cursor](#cursor) | `~/.cursor/mcp.json` |
| [Windsurf](#windsurf) | `~/.codeium/windsurf/mcp_config.json` |
| [JetBrains IDEs](#jetbrains-ides) | Settings > Tools > AI Assistant > MCP |
| [Google Gemini CLI](#google-gemini-cli) | `~/.gemini/settings.json` |
| [Amazon Q CLI](#amazon-q-cli) | `~/.aws/amazonq/mcp.json` |
| [Warp](#warp) | `~/.warp/mcp.json` |
| [Kiro](#kiro) | `.kiro/mcp.json` |
| [OpenAI Agents / ChatGPT](#openai-agents--chatgpt) | Agent Builder UI |

### VS Code

Add to `.vscode/mcp.json` in your project, or to User Settings for every project. VS Code Insiders takes the same config.

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

GitHub Copilot in VS Code reads the same file.

### Claude Code

```bash
claude mcp add-json @tago-io/mcp '{"type":"http","url":"https://mcp.ai.tago.io","headers":{"Authorization":"Bearer YOUR-TAGOIO-TOKEN"}}'
```

### Claude Desktop

Claude Desktop has no native HTTP transport, so bridge through `mcp-remote`:

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

Go to **Settings** > **Tools** > **AI Assistant** > **Model Context Protocol (MCP)** and add a server with this JSON:

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

### Warp

Warp has no native HTTP transport. Bridge through `mcp-remote` in `~/.warp/mcp.json`:

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

Kiro has no native HTTP transport. Bridge through `mcp-remote` in `.kiro/mcp.json` at your project root:

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

### OpenAI Agents / ChatGPT

In the OpenAI Agent Builder or ChatGPT MCP settings:

- **Server URL**: `https://mcp.ai.tago.io`
- **Protocol**: Streamable HTTP
- **Authentication**: `Authorization: Bearer YOUR-TAGOIO-TOKEN` header

## Custom Widget Skill

Custom widgets are React components under a strict authoring contract: a provider wrapper, exact `npm:` dependency pins, a `// tailwind` marker, and constructs that are not allowed. The tools validate code against that contract, but they do not teach it. The skill at [`skills/custom-widget-development/SKILL.md`](skills/custom-widget-development/SKILL.md) does, with worked examples.

Install it for Claude Code, for your user or for one project:

```bash
# all projects
mkdir -p ~/.claude/skills/custom-widget-development
curl -fsSL https://raw.githubusercontent.com/tago-io/mcp-server/master/skills/custom-widget-development/SKILL.md \
  -o ~/.claude/skills/custom-widget-development/SKILL.md

# one project
mkdir -p .claude/skills/custom-widget-development
curl -fsSL https://raw.githubusercontent.com/tago-io/mcp-server/master/skills/custom-widget-development/SKILL.md \
  -o .claude/skills/custom-widget-development/SKILL.md
```

For other clients, put the same file wherever that client loads skills or reusable prompts from. Skip this unless you write custom widget code; every other tool works without it.

## Authentication

The server accepts three kinds of TagoIO token, classified by prefix. Replace `YOUR-TAGOIO-TOKEN` in any config above with the one you pick.

| Token | Prefix | Access |
|---|---|---|
| **Profile** | `p-` | Full access to the profile. Generate one in [Profile Settings](https://admin.tago.io/profile). Start here. |
| **Analysis** | `a-` | Only what the analysis itself can reach. Copy it from **Analysis** > your analysis, which must run "External". Use this for production or shared environments where access is controlled through IAM. |
| **Device** | none | One device's data, through `read_device_data`, `send_device_data`, `edit_device_data`, and `delete_device_data` only. Account-level tools fail with permission errors. |

Any other prefix is rejected before the server makes a request.

## Regions and Endpoints

| Region | Endpoint |
|---|---|
| US East (default) | `https://api.us-e1.tago.io` |
| EU West | `https://api.eu-w1.tago.io` |

Set the region with the `x-tagoio-region` header, whose only accepted values are `us-e1` and `eu-w1`:

```
x-tagoio-region: eu-w1
```

A URL or hostname in this header is rejected with HTTP 400, so no request can name the host the server sends your token to. In STDIO mode there is no header; set `TAGOIO_API` to the region endpoint instead.

**Dedicated TagoDeploy instances** are reached by running the server yourself and setting `TAGOIO_API` to your instance (`https://` only). That works on all three transports: in STDIO it is the endpoint, and in HTTP or Lambda it pins every request to that instance, with the `x-tagoio-region` header ignored. The endpoint is always operator configuration at startup, never request input. The hosted `mcp.ai.tago.io` endpoint serves the public regions only.

## Tools

Every tool is single-purpose, named `verb_noun`, and annotated with whether it reads or writes. Each tool carries its own parameters, limits, and behavior in the description your client reads; the table below is just the map. Search tools take `filter`, `page`, `amount`, `fields`, and a `response_format` of `concise` or `detailed`. Resource IDs are snake_case (`device_id`), and the server applies wildcard name matching for you.

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
| Files | `search_files`, `delete_files` |
| Access management | `search_access_policies`, `get_access_policy`, `lookup_access_permissions`, `create_analysis_access_policy`, `create_run_user_access_policy`, `update_analysis_access_policy`, `update_run_user_access_policy`, `delete_access_policy` |
| Profile | `get_profile`, `get_profile_limits`, `get_profile_statistics`, `search_secrets` |
| Connectors & networks | `search_connectors`, `get_connector`, `search_networks`, `get_network` |
| Docs & examples | `platform_overview`, `search_docs`, `read_doc`, `search_code_examples`, `get_code_example` |

Your account credential never leaves the server. It is stripped from every result and every error, including script downloads and console output that happen to contain it. Submitted environment-variable values, uploaded script source, minted analysis tokens, and signed storage URLs are redacted the same way.

Deliberately not exposed: TagoRUN environment administration (`run.info`, `run.edit`), SSO and custom-domain settings, test emails, and anonymous-user creation.

## Troubleshooting

**Connection failed.** Check the token is valid: Profile Tokens live in [Profile Settings](https://admin.tago.io/profile), Analysis and Device tokens on the analysis or device itself. Check the endpoint matches your region. For the remote server, confirm `https://mcp.ai.tago.io` is reachable.

**Authentication error.** Confirm the token has the permissions the tool needs, and check the format: `Bearer YOUR-TOKEN` in the `Authorization` header over HTTP, or the `TAGOIO_TOKEN` environment variable over STDIO.

**No data comes back.** Check the device permissions on your profile, and that the device has data in the window you asked for.

**`mcp-remote` bridge problems** (Claude Desktop, Warp, Kiro). Confirm Node.js 22.12 or newer is installed, and that `mcp-remote` can reach `https://mcp.ai.tago.io`. Run it by hand to see the error:

```bash
npx -y mcp-remote https://mcp.ai.tago.io --header "Authorization: Bearer YOUR-TOKEN"
```

## Contributing

Issues and pull requests are welcome. Agent instructions live in [AGENTS.md](AGENTS.md).

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

Built by the TagoIO team. Need help? Visit the [TagoIO documentation](https://docs.tago.io) or contact support.
