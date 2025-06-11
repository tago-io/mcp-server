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

## Quick Start

### Prerequisites
- TagoIO account with valid profile token
- Compatible AI platform or IDE (see [Supported Platforms](#supported-platforms))

### Installation

#### One-Click Install for Development IDEs
[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=%40tago-io%2Fmcp&config=eyJjb21tYW5kIjoibnB4IC15IEB0YWdvLWlvL21jcC1zZXJ2ZXIiLCJlbnYiOnsiVEFHT0lPX1RPS0VOIjoiWU9VUi1QUk9GSUxFLVRPS0VOIiwiVEFHT0lPX0FQSSI6Imh0dHBzOi8vYXBpLnVzLWUxLnRhZ28uaW8ifX0%3D)

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=%40tago-io%2Fmcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40tago-io%2Fmcp-server%22%5D%2C%22env%22%3A%7B%22TAGOIO_TOKEN%22%3A%22%24%7Binput%3AtagoToken%7D%22%2C%22TAGOIO_API%22%3A%22https%3A%2F%2Fapi.us-e1.tago.io%22%7D%7D&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22tagoToken%22%2C%22description%22%3A%22TagoIO%20Profile%20Token%22%2C%22password%22%3Atrue%7D%5D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=%40tago-io%2Fmcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40tago-io%2Fmcp-server%22%5D%2C%22env%22%3A%7B%22TAGOIO_TOKEN%22%3A%22%24%7Binput%3AtagoToken%7D%22%2C%22TAGOIO_API%22%3A%22https%3A%2F%2Fapi.us-e1.tago.io%22%7D%7D&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22tagoToken%22%2C%22description%22%3A%22TagoIO%20Profile%20Token%22%2C%22password%22%3Atrue%7D%5D&quality=insiders)


#### Manual Configuration

Create or update your MCP configuration file:

```json
{
  "mcpServers": {
    "@tago-io/mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@tago-io/mcp-server"
      ],
      "env": {
        "TAGOIO_TOKEN": "YOUR-PROFILE-TOKEN",
        "TAGOIO_API": "https://api.us-e1.tago.io"
      }
    }
  }
}
```

**Configuration Parameters:**
- Replace `YOUR-PROFILE-TOKEN` with your TagoIO profile token
- Update API endpoint to `https://api.eu-w1.tago.io` for European accounts

### Configuration File Locations

| Platform | Configuration Path |
|----------|-------------------|
| **Cursor** | `~/.cursor/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **Cline** | `~/.cline/mcp_config.json` |
| **Claude Desktop** | `~/.claude/mcp_config.json` |

### Platform-Specific Setup

#### Claude Desktop
1. Download and install Claude Desktop
2. Copy the MCP configuration above
3. Send the prompt: _"Hey Claude, install the following MCP Server"_ with the configuration
4. Claude will automatically install and configure the server

#### Development IDEs
Place the configuration file in the appropriate location for your IDE and restart the application.

## Supported Platforms

| Platform | Status | Installation Method |
|----------|--------|-------------------|
| **Cursor** | ✅ Supported | One-click install |
| **Windsurf** | ✅ Supported | Manual configuration |
| **Claude Desktop** | ✅ Supported | Manual configuration |
| **VS Code** | ✅ Supported | One-click install |
| **Cline** | ✅ Supported | Manual configuration |

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
- Confirm profile token has necessary permissions
- Verify token format in configuration file

**Data Access Issues**
- Check device permissions in your TagoIO account
- Ensure devices have recent data available

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Need Help?** Visit the [TagoIO Documentation](https://docs.tago.io) or contact our support team.
