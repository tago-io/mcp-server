# MCP Server for TagoIO

A Model Context Protocol (MCP) server implementation for TagoIO data and analytics. This server enables AI models to interact with TagoIO's data and analytics capabilities through the Model Context Protocol.

## For Developers - Getting Started

1. Clone the repository:

```bash
git clone <repository-url>
cd test-mcp-server
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:

```env
PORT=8000
LOG_LEVEL=DEBUG
```

## Development

### Running the Server Locally

To start the server in development mode with hot-reload:

```bash
npm run start-fastify
```

This will start the server on `http://localhost:8000` (or the port specified in your `.env` file).

### Available Scripts

- `npm run start-fastify`: Start the server in development mode
- `npm run build`: Build the TypeScript project
- `npm run test`: Run tests using Vitest
- `npm run linter`: Run Biome linter
- `npm run linter-fix`: Fix linting issues automatically

## Testing and Development Tools

### MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is a standalone tool for testing and debugging MCP servers. It provides a user interface to:

- Test individual MCP tool calls
- Monitor server responses in real-time
- Debug protocol interactions
- View detailed request/response logs
- Validate MCP protocol compliance

To use the MCP Inspector:

1. Install the MCP Inspector tool:

```bash
npm install -g @modelcontextprotocol/inspector
```

2. Start the inspector:

```bash
mcp-inspector
```

3. Configure the inspector to connect to your local server:
   - Set the server URL to `http://localhost:8000/mcp`
   - Add any required environment variables
   - Click "Connect" to start testing

### Cursor IDE MCP Integration

Cursor IDE provides built-in support for MCP servers, allowing you to use AI models that can interact with your MCP server directly from the editor. To configure Cursor to use your MCP server:

1. Open Cursor IDE settings
2. Navigate to the MCP configuration section
3. Add a new MCP server configuration:

```json
{
  "mcpServers": {
    "middleware-mcp-tagoio": {
      "url": "http://localhost:8000/mcp",
      "headers": {
        "Authentication": "YOUR-PROFILE-TOKEN",
        "TagoIO-API": "https://api.us-e1.tago.io"
      }
    }
  }
}
```

4. Save the configuration
5. Restart Cursor IDE to apply the changes

Now you can use AI models in Cursor that will interact with your MCP server. The AI will be able to:

- Access TagoIO data through your MCP server
- Execute analytics operations
- Process and transform data
- All while maintaining the context of your development session

## Environment Variables

| Variable  | Description                                 | Default | Required |
| --------- | ------------------------------------------- | ------- | -------- |
| PORT      | Server port                                 | 8000    | No       |
| LOG_LEVEL | Logging level (DEBUG, INFO, WARNING, ERROR) | WARNING | No       |

## Headers - Client Connection

| Headers        | Description               | Default             | Required |
| -------------- | ------------------------- | ------------------- | -------- |
| Authentication | Your TagoIO profile token | -                   | ✅       |
| TagoIO-API     | TagoIO API endpoint       | https://api.tago.io | No       |
