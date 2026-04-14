<br/>
<p align="center">
  <img src="https://assets.tago.io/tagoio/tagoio.png" width="250px" alt="TagoIO"></img>
</p>

# TagoIO | MCP Server

Connect your AI assistant to your TagoIO devices, data, and platform resources — directly from your IDE or AI tool.

## Features

- **Device Management**: Access device information, configurations, and real-time data
- **Data Analysis**: Perform statistical operations (sums, averages, reports) on stored data
- **Platform Integration**: Retrieve users, actions, analysis scripts, and account statistics
- **Code Generation**: AI-powered TagoIO Analysis script generation with proper context
- **Development Support**: Debug assistance and tag relationship analysis
- **Dual Protocol Support**: STDIO (default) and HTTP Streamable transport protocols

## Quick Start

### Prerequisites

- Node.js 20+ installed (https://nodejs.org/en/download/)
- TagoIO account with a valid Profile token or Analysis token
- A supported AI platform or IDE (see [Platform-Specific Setup](#platform-specific-setup))

### Installation

#### Manual Configuration

The TagoIO MCP Server supports two transport protocols:

##### STDIO Transport (Default)

Best for local development with desktop AI assistants and IDEs:

```json
{
  "mcpServers": {
    "@tago-io/mcp": {
      "command": "npx",
      "args": ["-y", "@tago-io/mcp-server"],
      "env": {
        "TAGOIO_TOKEN": "YOUR-TOKEN",
        "TAGOIO_API": "https://api.us-e1.tago.io"
      }
    }
  }
}
```

You can also explicitly specify STDIO mode:

```json
{
  "mcpServers": {
    "@tago-io/mcp": {
      "command": "npx",
      "args": ["-y", "@tago-io/mcp-server", "stdio"],
      "env": {
        "TAGOIO_TOKEN": "YOUR-TOKEN",
        "TAGOIO_API": "https://api.us-e1.tago.io"
      }
    }
  }
}
```

##### HTTP Streamable Transport

For OpenAI Agent Builder and web-based AI platforms, start the MCP server in HTTP mode:

```bash
# Start on default port 3000
npx -y @tago-io/mcp-server http

# Or pick a custom port
MCP_PORT=8080 npx -y @tago-io/mcp-server http
```

Your server will be available at `http://localhost:3000/mcp`.

**Authentication:** Pass your TagoIO token in the `Authorization` header — with or without the `Bearer` prefix:
```
Authorization: Bearer YOUR-TAGOIO-TOKEN
```
or:
```
Authorization: YOUR-TAGOIO-TOKEN
```

**Region:** Requests default to US East (`us-e1`). To connect to a different region, add the `x-tagoio-region` header:
```
x-tagoio-region: eu-w1
```

For dedicated TagoIO instances, pass your full API URL instead:
```
x-tagoio-region: https://api.your-instance.tagoio.net
```

**OpenAI Agent Builder quick setup:**
- Server URL: `http://localhost:3000/mcp`
- Protocol: Streamable HTTP (MCP 2025-03-26)
- Authentication: Token in Authorization header (sent with each request)

In HTTP mode, each request carries its own token — no `TAGOIO_TOKEN` environment variable needed. Multiple clients with different credentials can connect at the same time.

##### AWS Lambda (Remote HTTP)

For connecting to the TagoIO MCP Server deployed on AWS Lambda via HTTP:

```json
{
  "mcpServers": {
    "@tago-io/mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://YOUR-API-GATEWAY-URL/mcp",
        "--header",
        "Authorization: Bearer YOUR-TAGOIO-TOKEN"
      ]
    }
  }
}
```

Replace `YOUR-API-GATEWAY-URL` with your Lambda API Gateway endpoint and `YOUR-TAGOIO-TOKEN` with your TagoIO Profile or Analysis token.

**Configuration Parameters:**

- Replace `YOUR-TOKEN` with your TagoIO Profile token or an Analysis token
  - **Analysis token (recommended):** Scoped permissions — you control exactly which resources the MCP server can access. Your analysis must be set to run "External" to use its token.
  - **Profile token:** Grants full access to your profile. Convenient for development, but not recommended for production.
- For European accounts, set the API endpoint to `https://api.eu-w1.tago.io` (STDIO mode) or pass `x-tagoio-region: eu-w1` header (HTTP mode)

### Platform-Specific Setup

#### Claude Desktop

1. Download and install Claude Desktop
2. Copy the MCP configuration above
3. Send the prompt: _"Hey Claude, install the following MCP Server"_ with the configuration
4. Claude will automatically install and configure the server

#### One-Click Install for Development IDEs

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-light.svg)](https://cursor.com/install-mcp?name=%40tago-io%2Fmcp&config=eyJjb21tYW5kIjoibnB4IC15IEB0YWdvLWlvL21jcC1zZXJ2ZXIiLCJlbnYiOnsiVEFHT0lPX1RPS0VOIjoiWU9VUi1QUk9GSUxFLVRPS0VOIiwiVEFHT0lPX0FQSSI6Imh0dHBzOi8vYXBpLnVzLWUxLnRhZ28uaW8ifX0%3D)

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=%40tago-io%2Fmcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40tago-io%2Fmcp-server%22%5D%2C%22env%22%3A%7B%22TAGOIO_TOKEN%22%3A%22%24%7Binput%3AtagoToken%7D%22%2C%22TAGOIO_API%22%3A%22https%3A%2F%2Fapi.us-e1.tago.io%22%7D%7D&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22tagoToken%22%2C%22description%22%3A%22TagoIO%20Profile%20Token%22%2C%22password%22%3Atrue%7D%5D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=%40tago-io%2Fmcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40tago-io%2Fmcp-server%22%5D%2C%22env%22%3A%7B%22TAGOIO_TOKEN%22%3A%22%24%7Binput%3AtagoToken%7D%22%2C%22TAGOIO_API%22%3A%22https%3A%2F%2Fapi.us-e1.tago.io%22%7D%7D&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22tagoToken%22%2C%22description%22%3A%22TagoIO%20Profile%20Token%22%2C%22password%22%3Atrue%7D%5D&quality=insiders)

Or place the configuration file in the appropriate location for your IDE and restart the application.

| Platform           | Configuration Path                    |
| ------------------ | ------------------------------------- |
| **Cursor**         | `~/.cursor/mcp.json`                  |
| **Windsurf**       | `~/.codeium/windsurf/mcp_config.json` |
| **Cline**          | `~/.cline/mcp_config.json`            |
| **Claude Desktop** | `~/.claude/mcp_config.json`           |

## Authentication

The MCP server accepts two types of TagoIO tokens:

- **Analysis token (recommended):** Go to **Analysis** → select your analysis → copy the token. Your analysis must be set to run "External". This gives the MCP server access only to the resources the analysis can reach.
- **Profile token:** Go to **Account Settings** → **Profile Tokens** → generate a new token. This grants full access to your profile — use it for development only.

Replace `YOUR-TOKEN` in the configuration with whichever token you choose.

**Security tip:** Never commit tokens to version control.

## API Endpoints

The server connects to these TagoIO regions out of the box:

- **US East**: `https://api.us-e1.tago.io` (default)
- **EU West**: `https://api.eu-w1.tago.io`

For STDIO mode, set the `TAGOIO_API` environment variable. For HTTP mode, pass the `x-tagoio-region` header.

Dedicated TagoIO instances are also supported — pass your full API URL as the region value.

## Troubleshooting

### Common Issues

**Connection Failed**

- Check your profile token validity
- Ensure correct API endpoint for your region

**Authentication Error**

- Confirm profile or analysis token has necessary permissions
- Verify token format in configuration file

**Data Access Issues**

- Check device permissions in your TagoIO account
- Ensure devices have recent data available

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Need Help?** Visit the [TagoIO Documentation](https://docs.tago.io) or contact our support team.
