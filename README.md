<br/>
<p align="center">
  <img src="https://assets.tago.io/tagoio/tagoio.png" width="250px" alt="TagoIO"></img>
</p>

# TagoIO | MCP Server

The TagoIO MCP Server enables AI models to interact directly with your TagoIO account, providing contextual access to devices, data, and platform resources for enhanced development workflows and intelligent data analysis.

## Features

- **Device Management**: Access device information, configurations, and real-time data
- **Data Analysis**: Perform statistical operations (sums, averages, reports) on stored data
- **Platform Integration**: Retrieve users, actions, analysis scripts, and account statistics
- **Code Generation**: AI-powered TagoIO Analysis script generation with proper context
- **Development Support**: Debug assistance and tag relationship analysis
- **Dual Protocol Support**: STDIO (default) and HTTP Streamable transport protocols

## Quick Start

### Prerequisites

- Installed Node.js 18+ (https://nodejs.org/en/download/)
- TagoIO account with valid profile token or analysis token
- Compatible AI platform or IDE (see [Supported Platforms](#supported-platforms))

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

Required for OpenAI Agent Builder and web-based AI platforms:

```bash
# Start HTTP server on default port 3000
npx -y @tago-io/mcp-server http

# Or specify custom port
MCP_PORT=8080 npx -y @tago-io/mcp-server http
```

The HTTP server will be available at: `http://localhost:3000/mcp`

**Authentication:** HTTP mode uses Bearer token authentication. Include your TagoIO token in the `Authorization` header:
```
Authorization: Bearer YOUR-TAGOIO-TOKEN
```

**HTTP Configuration for OpenAI Agent Builder:**
- Server URL: `http://localhost:3000/mcp`
- Protocol: Streamable HTTP (MCP 2025-03-26)
- Authentication: Bearer token (passed in Authorization header on each request)
- CORS: Enabled for web-based integrations

**Note:** Unlike STDIO mode, HTTP mode does not require `TAGOIO_TOKEN` environment variable. Each client connection authenticates with their own Bearer token, allowing multiple clients with different credentials to connect simultaneously.

**Configuration Parameters:**

- Replace `YOUR-TOKEN` with your TagoIO Profile token or an Analysis Token
  - Using an Analysis token is recommended for better security, as you can limit the token's permissions to only the resources you need. Your analysis must be set to run "External" so you can use the token.
  - Using a Profile token is going to instantly grant the MCP access to your entire profile, but it's not recommended for production environments.
- Update API endpoint to `https://api.eu-w1.tago.io` for European accounts

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

The MCP server requires a **TagoIO Profile Token** for authentication:

1. Log into your TagoIO account
2. Navigate to **Account Settings** → **Profile Tokens**
3. Generate a new token with appropriate permissions
4. Replace `YOUR-PROFILE-TOKEN` in the configuration

**Security Note**: Keep your profile token secure and never commit it to version control.

## API Endpoints

The server supports both US and European TagoIO instances:

- **US East**: `https://api.us-e1.tago.io` (default)
- **EU West**: `https://api.eu-w1.tago.io`

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
