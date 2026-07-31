<br/>

<p align="center">
  <img src="https://assets.tago.io/tagoio/tagoio.png" width="200px" alt="TagoIO"></img>
</p>

# TagoIO | MCP Server

Work on your TagoIO account by asking. Your AI assistant reads your devices, data, dashboards, and analyses, and makes the changes you ask for, from your IDE or chat tool.

[![Install in VS Code](https://img.shields.io/badge/Install_in-VS_Code-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](<https://vscode.dev/redirect/mcp/install?name=%40tago-io%2Fmcp&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.ai.tago.io%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22%24%7Binput%3Atagoio-token%7D%22%2C%22x-tagoio-region%22%3A%22us-e1%22%7D%2C%22inputs%22%3A%5B%7B%22id%22%3A%22tagoio-token%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Enter%20your%20TagoIO%20Profile%20Token%20(Bearer%20format)%22%2C%22password%22%3Atrue%7D%5D%7D>)
[![Install in VS Code Insiders](https://img.shields.io/badge/Install_in-VS_Code_Insiders-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](<https://insiders.vscode.dev/redirect/mcp/install?name=%40tago-io%2Fmcp&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.ai.tago.io%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22%24%7Binput%3Atagoio-token%7D%22%2C%22x-tagoio-region%22%3A%22us-e1%22%7D%2C%22inputs%22%3A%5B%7B%22id%22%3A%22tagoio-token%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Enter%20your%20TagoIO%20Profile%20Token%20(Bearer%20format)%22%2C%22password%22%3Atrue%7D%5D%7D&quality=insiders>)
[![Install in Visual Studio](https://img.shields.io/badge/Install_in-Visual_Studio-C16FDE?style=flat-square&logo=visualstudio&logoColor=white)](<https://vs-open.link/mcp-install?%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.ai.tago.io%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22%24%7Binput%3Atagoio-token%7D%22%2C%22x-tagoio-region%22%3A%22us-e1%22%7D%2C%22inputs%22%3A%5B%7B%22id%22%3A%22tagoio-token%22%2C%22type%22%3A%22promptString%22%2C%22description%22%3A%22Enter%20your%20TagoIO%20Profile%20Token%20(Bearer%20format)%22%2C%22password%22%3Atrue%7D%5D%7D>)
[![Install in Cursor](https://img.shields.io/badge/Install_in-Cursor-000000?style=flat-square&logoColor=white)](https://cursor.com/en/install-mcp?name=%40tago-io%2Fmcp&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHBzOi8vbWNwLmFpLnRhZ28uaW8iLCJoZWFkZXJzIjp7IkF1dGhvcml6YXRpb24iOiIke2lucHV0OnRhZ29pby10b2tlbn0iLCJ4LXRhZ29pby1yZWdpb24iOiJ1cy1lMSJ9LCJpbnB1dHMiOlt7ImlkIjoidGFnb2lvLXRva2VuIiwidHlwZSI6InByb21wdFN0cmluZyIsImRlc2NyaXB0aW9uIjoiRW50ZXIgeW91ciBUYWdvSU8gUHJvZmlsZSBUb2tlbiAoQmVhcmVyIGZvcm1hdCkiLCJwYXNzd29yZCI6dHJ1ZX1dfQ==)
[![Add to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=%40tago-io%2Fmcp&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHBzOi8vbWNwLmFpLnRhZ28uaW8iLCJoZWFkZXJzIjp7IkF1dGhvcml6YXRpb24iOiIke2lucHV0OnRhZ29pby10b2tlbn0iLCJ4LXRhZ29pby1yZWdpb24iOiJ1cy1lMSJ9LCJpbnB1dHMiOlt7ImlkIjoidGFnb2lvLXRva2VuIiwidHlwZSI6InByb21wdFN0cmluZyIsImRlc2NyaXB0aW9uIjoiRW50ZXIgeW91ciBUYWdvSU8gUHJvZmlsZSBUb2tlbiAoQmVhcmVyIGZvcm1hdCkiLCJwYXNzd29yZCI6dHJ1ZX1dfQ==)

---

## Start here

1. **Get a token.** Generate a Profile Token in [TagoIO Profile Settings](https://admin.tago.io/profile).
2. **Add the server to your client.** Use an install button above, or copy the config for your tool from [Client setup](#client-setup).
3. **Ask something.** Try: _"List my devices and tell me which ones stopped sending data this week."_

Your client connects to the TagoIO hosted server at `https://mcp.ai.tago.io`. You can also [run the server yourself](#run-it-locally).

## What you can ask for

The server gives your assistant around 80 focused capabilities across your account. You describe the outcome, and it picks the tools. Some things that work well today:

**Understand your fleet**

- "Which devices haven't sent data in the last 7 days?"
- "Show me the last 50 records from Water Meter 12 and summarize the flow variable."
- "Create a device on my LoRaWAN network, then give me its token."

**Debug without tab-switching**

- "The Daily Report analysis failed last night. Read the console and tell me why."
- "Fix the bug you found, upload the script, and run it once to confirm."
- "A customer says their dashboard is empty. Log in as that user and check what they see."

**Build dashboards from a description**

- "Build a dashboard for my cold chain fleet: a map of the units, a temperature line chart for the last 24 hours, and a card for battery level."
- "This gauge shows no value. Compare its configuration to the variables the device actually sends."

**Untangle permissions**

- "My analysis gets a permission error writing to the Sites entity. What policy does it need?"
- "Show me every access policy that touches TagoRUN users."

**Keep the account tidy**

- "How close am I to my data records limit this month?"
- "Find stored files older than a year and larger than 5 MB, then delete them."

**Write code with the docs in context**

- "Find the official example for parsing a Dragino LHT65 payload and adapt it to my device."

The server reads and writes. Deleting data, rotating credentials, and uploading scripts run through your assistant's confirmation flow, so you approve each change before it lands.

## Client setup

Each config below points at the hosted server. Replace `YOUR-TAGOIO-TOKEN` with your Profile Token.

| Client                                               | Where the config lives                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [VS Code / GitHub Copilot](#vs-code--github-copilot) | `.vscode/mcp.json` or User Settings                                                                                                |
| [Claude Code](#claude-code)                          | `claude mcp add-json` CLI                                                                                                          |
| [Claude Desktop](#claude-desktop)                    | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |
| [Cursor](#cursor)                                    | `~/.cursor/mcp.json`                                                                                                               |
| [Windsurf](#windsurf)                                | `~/.codeium/windsurf/mcp_config.json`                                                                                              |
| [JetBrains IDEs](#jetbrains-ides)                    | Settings > Tools > AI Assistant > MCP                                                                                              |
| [Google Gemini CLI](#google-gemini-cli)              | `~/.gemini/settings.json`                                                                                                          |
| [Amazon Q CLI](#amazon-q-cli)                        | `~/.aws/amazonq/mcp.json`                                                                                                          |
| [Warp](#warp)                                        | `~/.warp/mcp.json`                                                                                                                 |
| [Kiro](#kiro)                                        | `.kiro/mcp.json`                                                                                                                   |
| [OpenAI Agents / ChatGPT](#openai-agents--chatgpt)   | Agent Builder UI                                                                                                                   |

### VS Code / GitHub Copilot

Add to `.vscode/mcp.json` for one project, or to User Settings for all of them. VS Code Insiders takes the same config, and Copilot reads the same file.

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

### Claude Code

```bash
claude mcp add-json tagoio '{"type":"http","url":"https://mcp.ai.tago.io","headers":{"Authorization":"Bearer YOUR-TAGOIO-TOKEN"}}'
```

### Claude Desktop

Connect through the `mcp-remote` bridge.

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

Open **Settings** > **Tools** > **AI Assistant** > **Model Context Protocol (MCP)**, add a server, and paste:

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

Connect through the `mcp-remote` bridge.

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

Connect through the `mcp-remote` bridge, in `.kiro/mcp.json` at your project root.

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

In Agent Builder or ChatGPT MCP settings:

- **Server URL**: `https://mcp.ai.tago.io`
- **Protocol**: Streamable HTTP
- **Authentication**: `Authorization: Bearer YOUR-TAGOIO-TOKEN` header

## Choosing a token

| Token        | Where to get it                                     | What it reaches                                                                                                    |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Profile**  | [Profile Settings](https://admin.tago.io/profile)   | Your whole profile. Start here.                                                                                    |
| **Analysis** | **Analysis** > your analysis, set to run "External" | Only what that analysis can reach. Fits shared and production environments where access is controlled through IAM. |
| **Device**   | The device itself                                   | That device's data. Account-level requests return a permission error.                                              |

## Regions and endpoints

Requests go to US East by default. Set the `x-tagoio-region` header to reach a different endpoint:

| Value                          | Target                             |
| ------------------------------ | ---------------------------------- |
| `us-e1`                        | US East (default)                  |
| `eu-w1`                        | EU West                            |
| `https://api.your-instance.io` | Your dedicated TagoDeploy instance |

```
x-tagoio-region: eu-w1
```

For TagoDeploy, pass your instance's full API endpoint over `https://`. This works on the hosted server, so a dedicated instance needs the same one-line config as a public region.

Over STDIO there are no headers. Set `TAGOIO_API` to your endpoint instead.

## Run it locally

Run the server on your own machine for offline work, or when your network blocks outbound connections. Install [Node.js 22.12](https://nodejs.org/en/download/) or newer, then:

```bash
npx -y @tago-io/mcp-server        # STDIO, what desktop apps and IDEs expect
npx -y @tago-io/mcp-server http   # HTTP on port 3000
```

STDIO reads the token from the environment:

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

HTTP mode takes the token per request, so several people can share one server with their own credentials. Set the port with `MCP_PORT`, and check `GET /health` to confirm the server is up. To point any config in this README at your local server, swap the URL for `http://localhost:3000`. Run `npx -y @tago-io/mcp-server --help` for the full option list.

## Writing custom widgets

Custom widgets are React components with a strict authoring contract: a provider wrapper, pinned `npm:` dependencies, a `// tailwind` marker. The server validates your code against that contract and reports what breaks it.

The [custom widget skill](skills/custom-widget-development/SKILL.md) teaches the contract itself, with worked examples. Install it for Claude Code:

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

For other clients, put the same file wherever that client loads skills or reusable prompts from.

## Your token and your data

The server strips your token from every result, error, script download, and console output before it reaches your assistant. Environment variable values, minted analysis tokens, and signed file URLs get the same treatment.

Some settings stay in the TagoIO admin: TagoRUN environment configuration, SSO and custom domains, test emails, and anonymous user creation.

## Troubleshooting

**It won't connect.** Confirm the token is still valid and that `https://mcp.ai.tago.io` is reachable from your network. If your account lives in EU West, set the `x-tagoio-region` header.

**Authentication error.** Over HTTP the header reads `Bearer YOUR-TOKEN`, with the space. Over STDIO the token goes in `TAGOIO_TOKEN`. If the format checks out, the token may lack permission for what you asked.

**A request comes back empty.** Two usual causes: the device has no data in the window you asked about, or your profile lacks access to that device.

**The bridge fails** (Claude Desktop, Warp, Kiro). Check for Node.js 22.12 or newer, then run the bridge by hand to read the real error:

```bash
npx -y mcp-remote https://mcp.ai.tago.io --header "Authorization: Bearer YOUR-TOKEN"
```

<details>
<summary><b>Full tool reference</b></summary>

<br/>

Every tool the server exposes, grouped by domain. Each one carries its own parameters, limits, and read or write annotation in the description your client reads.

| Domain                 | Tools                                                                                                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Devices                | `search_devices`, `get_device`, `create_device`, `update_device`, `delete_device`, `configure_device`                                                                                                                                                                             |
| Device data            | `read_device_data`, `send_device_data`, `edit_device_data`, `delete_device_data`                                                                                                                                                                                                  |
| Actions                | `search_actions`, `get_action`, `create_action`, `update_action`, `delete_action`                                                                                                                                                                                                 |
| Analyses               | `search_analyses`, `get_analysis`, `create_analysis`, `update_analysis`, `delete_analysis`, `upload_analysis_script`, `download_analysis_script`, `run_analysis`, `read_analysis_console`                                                                                         |
| Dashboards & widgets   | `search_dashboards`, `get_dashboard`, `create_dashboard`, `update_dashboard`, `delete_dashboard`, `get_widget`, `create_widget`, `update_widget`, `delete_widget`, `widget_schema_lookup`, `validate_widget_configuration`, `get_custom_widget_code`, `upload_custom_widget_code` |
| Entities               | `search_entities`, `get_entity`, `create_entity`, `update_entity`, `delete_entity`, `update_entity_schema`                                                                                                                                                                        |
| Entity data            | `read_entity_data`, `send_entity_data`, `edit_entity_data`, `delete_entity_data`, `empty_entity_data`                                                                                                                                                                             |
| Run users              | `search_run_users`, `get_run_user`, `create_run_user`, `update_run_user`, `delete_run_user`, `login_as_run_user`                                                                                                                                                                  |
| Run-user notifications | `read_run_user_notifications`, `send_run_user_notification`, `update_run_user_notification`, `delete_run_user_notification`                                                                                                                                                       |
| Files                  | `search_files`, `delete_files`                                                                                                                                                                                                                                                    |
| Access management      | `search_access_policies`, `get_access_policy`, `lookup_access_permissions`, `create_analysis_access_policy`, `create_run_user_access_policy`, `update_analysis_access_policy`, `update_run_user_access_policy`, `delete_access_policy`                                            |
| Profile                | `get_profile`, `get_profile_limits`, `get_profile_statistics`, `search_secrets`                                                                                                                                                                                                   |
| Connectors & networks  | `search_connectors`, `get_connector`, `search_networks`, `get_network`                                                                                                                                                                                                            |
| Docs & examples        | `platform_overview`, `search_docs`, `read_doc`, `search_code_examples`, `get_code_example`                                                                                                                                                                                        |

</details>

## Contributing

Issues and pull requests are welcome. Agent instructions live in [AGENTS.md](AGENTS.md).

## License

MIT. See the LICENSE file.

---

Built by the TagoIO team. Need a hand? Check the [TagoIO documentation](https://docs.tago.io) or contact support.
