# MCP HTTP Protocol Implementation Guide

This document explains the technical details of the HTTP transport implementation for the TagoIO MCP server, including why specific HTTP methods are used, the JSON-RPC message format, and request/response structures.

## Table of Contents

- [HTTP Methods Overview](#http-methods-overview)
- [JSON-RPC 2.0 Message Format](#json-rpc-20-message-format)
- [Request Body Structures](#request-body-structures)
- [Authentication Flow](#authentication-flow)
- [Session Management](#session-management)
- [The mcp-session-id Header Explained](#the-mcp-session-id-header-explained)
- [OpenAI Agent Builder Integration](#openai-agent-builder-integration)
- [Testing Your MCP Server](#testing-your-mcp-server)

## HTTP Methods Overview

The MCP Streamable HTTP protocol requires four HTTP methods for complete functionality:

### POST - Tool Calls and Initialization

**Purpose**: Send JSON-RPC requests to initialize sessions and execute MCP tools

**Why it's required**:
- MCP protocol uses JSON-RPC 2.0 for all client-to-server requests
- POST is the standard HTTP method for sending JSON payloads
- Handles both initialization (`initialize` request) and subsequent tool calls

**Example Usage**:
```bash
# Initialize session
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR-TAGOIO-TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }'

# Call a tool (after initialization)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: SESSION-ID-FROM-INIT" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "device-list",
      "arguments": {}
    }'
```

### GET - Server-Sent Events (SSE) Stream

**Purpose**: Establish a long-lived connection to receive server-initiated messages

**Why it's required**:
- MCP servers need to send notifications, progress updates, and logging messages
- SSE provides a standardized way for servers to push real-time updates to clients
- GET requests with `text/event-stream` response type are the standard for SSE

**Important Note About SSE**:
- **SSE is still actively used** in the MCP Streamable HTTP protocol
- What was deprecated (March 26, 2025) was the old "SSE transport" protocol specification
- The current **Streamable HTTP protocol** uses SSE for server-to-client messages
- SSE is combined with standard HTTP methods (POST/GET/DELETE/OPTIONS) into one unified protocol

**Example Usage**:
```bash
# Connect to SSE stream
curl -N -H "mcp-session-id: SESSION-ID" \
  http://localhost:3000/mcp
```

**SSE Response Format**:
```
event: message
id: event-1
data: {"jsonrpc":"2.0","method":"notifications/message","params":{...}}

event: message
id: event-2
data: {"jsonrpc":"2.0","method":"logging/message","params":{...}}
```

**Technical Detail**:
When a GET request is received with a valid session ID, the `StreamableHTTPServerTransport` responds with:
- `Content-Type: text/event-stream`
- Connection kept alive for real-time message delivery
- Events formatted according to SSE specification

### DELETE - Session Termination

**Purpose**: Gracefully close an active MCP session

**Why it's required**:
- Allows clients to explicitly signal they're done with a session
- Triggers server-side cleanup of resources (transport, connections, memory)
- Prevents resource leaks in long-running server processes

**Example Usage**:
```bash
curl -X DELETE http://localhost:3000/mcp \
  -H "mcp-session-id: SESSION-ID"
```

### OPTIONS - CORS Preflight

**Purpose**: Handle CORS (Cross-Origin Resource Sharing) preflight requests

**Why it's required**:
- Web browsers send OPTIONS requests before actual requests to check CORS permissions
- Required for OpenAI Agent Builder and other web-based MCP clients
- Returns allowed methods, headers, and origins without processing the request

**Example Response**:
```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, mcp-session-id, Last-Event-ID
Access-Control-Max-Age: 86400
```

## JSON-RPC 2.0 Message Format

All MCP messages follow the [JSON-RPC 2.0 specification](https://www.jsonrpc.org/specification). This is **mandatory** for MCP protocol compliance.

### Why JSON-RPC 2.0?

1. **Standardization**: MCP is built on JSON-RPC 2.0, ensuring interoperability across all MCP implementations
2. **Structured Error Handling**: Provides consistent error format that clients can programmatically handle
3. **Request/Response Correlation**: The `id` field links responses to their corresponding requests
4. **Protocol Versioning**: The `jsonrpc` field explicitly declares the protocol version

### Required Fields in Error Responses

```typescript
{
  "jsonrpc": "2.0",        // Protocol version identifier (REQUIRED)
  "error": {               // Error object (REQUIRED for error responses)
    "code": -32000,        // Numeric error code (REQUIRED)
    "message": "..."       // Human-readable error message (REQUIRED)
  },
  "id": null               // Request ID or null if unknown (REQUIRED)
}
```

### Why Each Field is Required

#### `jsonrpc: "2.0"`
- **Purpose**: Identifies the message as JSON-RPC 2.0
- **Requirement**: MCP clients validate this field to ensure protocol compatibility
- **Without it**: Clients will reject the response as invalid/unknown protocol

#### `error: { code, message }`
- **Purpose**: Provides structured error information
- **Requirement**: JSON-RPC 2.0 spec mandates this structure for error responses
- **Error Codes**: MCP uses standard JSON-RPC error codes:
  - `-32700`: Parse error (invalid JSON)
  - `-32600`: Invalid request
  - `-32601`: Method not found
  - `-32602`: Invalid params
  - `-32603`: Internal error
  - `-32000` to `-32099`: Server-defined errors (used for auth, session errors)

#### `id: null`
- **Purpose**: Correlates response to the original request
- **Requirement**: JSON-RPC 2.0 requires `id` in all responses
- **When null**: Used when the request couldn't be processed enough to extract the request ID

### Example: Why HTTP Status Codes Alone Are Insufficient

**Incorrect (Non-compliant)**:
```typescript
// This will cause MCP clients to fail
res.writeHead(401, { "Content-Type": "application/json" });
res.end(JSON.stringify({ error: "Invalid token" }));
```

**Result**: Client shows "Protocol error: Invalid JSON-RPC response" instead of the actual error message.

**Correct (MCP Compliant)**:
```typescript
// HTTP status + JSON-RPC error format
res.writeHead(401, {
  "Content-Type": "application/json",
  ...CORS_HEADERS
});
res.end(JSON.stringify({
  jsonrpc: "2.0",
  error: {
    code: -32000,
    message: "Unauthorized: Invalid TagoIO token"
  },
  id: null
}));
```

**Result**: Client properly displays "Unauthorized: Invalid TagoIO token" and can programmatically handle the error.

## Request Body Structures

### Initialize Request

**Purpose**: Establish a new MCP session with the server

**Required Fields**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "client-name",
      "version": "1.0.0"
    }
  }
}
```

**Headers**:
- `Content-Type: application/json` (required)
- `Authorization: Bearer YOUR-TAGOIO-TOKEN` (required for this server)
- **NO** `mcp-session-id` header (session doesn't exist yet)

**Why these fields**:
- `protocolVersion`: Ensures client/server protocol compatibility
- `capabilities`: Declares what features the client supports (tools, resources, prompts, etc.)
- `clientInfo`: Identifies the client for logging and debugging

**Response**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {},
      "resources": {},
      "prompts": {},
      "logging": {}
    },
    "serverInfo": {
      "name": "middleware-mcp-tagoio",
      "version": "1.0.0"
    }
  }
}
```

**Response Headers**:
- `mcp-session-id: UUID` - Session ID for subsequent requests

### Tool Call Request

**Purpose**: Execute a registered MCP tool

**Required Fields**:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "device-list",
    "arguments": {
      "amount": 10,
      "page": 1
    }
  }
}
```

**Headers**:
- `Content-Type: application/json` (required)
- `mcp-session-id: UUID` (required - from initialize response)
- **NO** `Authorization` header needed (authenticated via session)

**Why these fields**:
- `method: "tools/call"`: Specifies this is a tool execution request
- `params.name`: Identifies which tool to execute
- `params.arguments`: Tool-specific input parameters (validated by tool's Zod schema)

**Response**:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Found 10 devices:\n1. Device A\n2. Device B\n..."
      }
    ]
  }
}
```

### List Tools Request

**Purpose**: Retrieve available tools from the server

**Required Fields**:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/list",
  "params": {}
}
```

**Headers**:
- `Content-Type: application/json`
- `mcp-session-id: UUID`

**Response**:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "tools": [
      {
        "name": "device-list",
        "description": "List devices in your TagoIO account",
        "inputSchema": {
          "type": "object",
          "properties": {
            "amount": { "type": "number" },
            "page": { "type": "number" }
          }
        }
      }
    ]
  }
}
```

## Authentication Flow

### Bearer Token Authentication (HTTP Mode)

Unlike STDIO mode which uses environment variables, HTTP mode authenticates each session via the `Authorization` header.

**Step-by-Step Flow**:

1. **Client sends initialize request with Bearer token**:
```http
POST /mcp HTTP/1.1
Authorization: Bearer 12345678-abcd-1234-abcd-123456789abc
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": { ... }
}
```

2. **Server validates token**:
```typescript
// Extract token from Authorization header
const token = extractBearerToken(req);

// Validate by calling TagoIO API
const resources = new Resources({ token });
await resources.account.info(); // Throws if invalid
```

3. **Server creates session with validated token**:
```typescript
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  onsessioninitialized: (sessionId) => {
    // Store session with this client's Resources instance
    sessions[sessionId] = { transport, resources };
  }
});
```

4. **Server returns session ID in response header**:
```http
HTTP/1.1 200 OK
mcp-session-id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... }
}
```

5. **Client uses session ID for subsequent requests**:
```http
POST /mcp HTTP/1.1
mcp-session-id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": { ... }
}
```

**Why this approach**:
- **Multi-tenant**: Multiple clients with different tokens can connect simultaneously
- **Security**: Each session has isolated permissions based on their token
- **No environment pollution**: No need to restart server when changing tokens
- **Web compatibility**: Standard HTTP authentication that works with browsers

## Session Management

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Client sends initialize with Bearer token               │
│    POST /mcp                                                │
│    Authorization: Bearer TOKEN                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Server validates token via TagoIO API                   │
│    - Creates Resources instance with client's token        │
│    - Generates unique session ID (UUID)                     │
│    - Stores { transport, resources } in sessions map       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Server returns mcp-session-id header                    │
│    HTTP/1.1 200 OK                                          │
│    mcp-session-id: UUID                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Client uses session ID for all subsequent requests      │
│    POST /mcp (tools/call)                                   │
│    GET /mcp (SSE stream)                                    │
│    mcp-session-id: UUID                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Client terminates session when done                     │
│    DELETE /mcp                                              │
│    mcp-session-id: UUID                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Server cleans up session resources                      │
│    - Closes transport                                       │
│    - Removes from sessions map                              │
│    - Releases memory                                        │
└─────────────────────────────────────────────────────────────┘
```

### Session Storage Structure

```typescript
interface SessionData {
  transport: StreamableHTTPServerTransport; // MCP transport instance
  resources: Resources;                     // TagoIO SDK with client's token
}

interface SessionMap {
  [sessionId: string]: SessionData;
}

// Server maintains this map
const sessions: SessionMap = {
  "550e8400-...": {
    transport: StreamableHTTPServerTransport { ... },
    resources: Resources { token: "client-a-token" }
  },
  "660f9500-...": {
    transport: StreamableHTTPServerTransport { ... },
    resources: Resources { token: "client-b-token" }
  }
};
```

**Why session-based architecture**:
- **Stateful protocol**: MCP requires maintaining state between requests
- **Per-client isolation**: Each session has its own Resources instance with different permissions
- **Performance**: Avoid re-authenticating on every request
- **Transport reuse**: Single transport instance handles all requests for a session

### Session Validation

For all non-initialize requests, the server validates:

1. **Session ID present**: `mcp-session-id` header must exist
2. **Session exists**: Session ID must be in the sessions map
3. **Transport active**: Transport must not be closed

**Validation Errors**:

```typescript
// Missing session ID
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Bad Request: No valid session ID provided"
  },
  "id": null
}

// Invalid session ID
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Bad Request: Invalid or missing session ID"
  },
  "id": null
}
```

## The mcp-session-id Header Explained

### Why Does `mcp-session-id` Exist?

The `mcp-session-id` header is fundamental to the MCP Streamable HTTP protocol. It solves a critical problem: **HTTP is stateless, but MCP needs state**.

### The Problem: HTTP is Stateless

HTTP protocol has no memory between requests. Each request is independent and doesn't "know" about previous requests. But MCP protocol is **stateful** - it needs to maintain context across multiple requests:

```
Client connects → Initialize → Use tools → Get notifications → Disconnect
                     ↓            ↓              ↓
              All need to share the same context/state
```

Without `mcp-session-id`, the server wouldn't know:
- Which MCP server instance belongs to this client
- Which transport to use for sending responses
- Which Resources instance (with the client's token) to use
- Which SSE stream belongs to this client

### Why Not Use Other Approaches?

#### ❌ Cookies
- **CORS complexity**: Requires `credentials: 'include'` in fetch requests
- **Not suitable for non-browser clients**: CLI tools, servers can't use cookies easily
- **Not in MCP spec**: The specification defines `mcp-session-id` as standard

#### ❌ Authorization Header Only
- **Token ≠ Session**: Multiple clients can use the same token
- **No uniqueness**: Two clients with same token need separate sessions
- **Resource isolation**: Each session needs its own transport and state

#### ❌ Connection Keep-Alive
- **Multiple connections**: POST for tools, GET for SSE are separate connections
- **Load balancers**: May route requests to different server instances
- **Not standardized**: Different HTTP clients handle keep-alive differently

### What `mcp-session-id` Actually Represents

In our implementation, the session ID is a **pointer** to server-side session data:

```typescript
interface SessionData {
  transport: StreamableHTTPServerTransport;  // MCP protocol handler
  resources: Resources;                      // TagoIO SDK with client's token
}

const sessions: SessionMap = {
  "550e8400-e29b-41d4-a716-446655440000": {
    transport: StreamableHTTPServerTransport { ... },
    resources: Resources { token: "client-token-abc" }
  }
};
```

The session ID provides access to:
1. **The transport**: Handles JSON-RPC messages and SSE streams
2. **The Resources instance**: Contains the authenticated TagoIO client

### How It Works in Practice

**Step 1: Initialization (POST)**
```http
POST /mcp
Authorization: Bearer TOKEN-123
Content-Type: application/json

{ "jsonrpc": "2.0", "method": "initialize", ... }
```

**Step 2: Server generates session**
```typescript
const sessionId = randomUUID(); // "550e8400-..."
sessions[sessionId] = {
  transport: new StreamableHTTPServerTransport(...),
  resources: new Resources({ token: TOKEN-123 })
};
```

**Step 3: Response includes session ID**
```http
HTTP/1.1 200 OK
mcp-session-id: 550e8400-e29b-41d4-a716-446655440000

{ "jsonrpc": "2.0", "result": { ... } }
```

**Step 4: Client uses session ID for subsequent requests**
```http
POST /mcp
mcp-session-id: 550e8400-e29b-41d4-a716-446655440000

{ "jsonrpc": "2.0", "method": "tools/call", ... }
```

**Step 5: Server looks up session**
```typescript
const sessionId = req.headers["mcp-session-id"];
const session = sessions[sessionId]; // Gets stored transport + resources
await session.transport.handleRequest(req, res, body);
```

### Why Custom Header Instead of Standard?

The MCP specification chose `mcp-session-id` as a custom header because:

1. **Protocol-specific**: Clearly indicates this is MCP-related
2. **Transport-agnostic**: Works with any HTTP client (browsers, cURL, SDKs)
3. **Explicit**: No ambiguity about what it represents
4. **Standardized**: All MCP servers/clients use the same header name

### Security Model

**Session ID vs Bearer Token**:
- **Bearer Token**: Proves identity (who you are) - used once during initialization
- **Session ID**: References an already-authenticated session (which conversation) - used for all subsequent requests

This is more efficient than validating the Bearer token on every request:

```typescript
// Without session (slow):
Every request → Validate token via TagoIO API → Execute tool

// With session (fast):
First request → Validate token via TagoIO API → Create session
Later requests → Look up session → Execute tool (no API call needed)
```

### Multi-Tenant Support

Session IDs enable multiple clients to use the same or different tokens simultaneously:

```typescript
// Two clients using the same TagoIO token
Client A → Token-123 → Session: 550e8400-...
Client B → Token-123 → Session: 660f9500-...

sessions = {
  "550e8400-...": { transport: TransportA, resources: Resources(Token-123) },
  "660f9500-...": { transport: TransportB, resources: Resources(Token-123) }
};
```

Each session is independent:
- Makes independent tool calls
- Receives separate SSE streams
- Can terminate independently

Without session IDs, we couldn't distinguish between these two clients.

### Summary: Why `mcp-session-id` is Essential

The `mcp-session-id` header exists because:
1. ✅ HTTP is stateless, but MCP needs state
2. ✅ It maps to server-side session data (transport + authenticated client)
3. ✅ It allows multiple concurrent sessions with the same or different tokens
4. ✅ It's more efficient than re-authenticating every request
5. ✅ It's the MCP specification standard for HTTP transport

The header is essentially a **session token** that references an already-authenticated, stateful MCP connection.

## OpenAI Agent Builder Integration

### Does OpenAI Agent Builder Support `mcp-session-id`?

**Yes!** OpenAI Agent Builder (and all MCP-compliant clients) **automatically handle `mcp-session-id`** - you don't need to configure anything special.

### How Agent Builder Handles Sessions Automatically

When you configure an MCP server in OpenAI Agent Builder:

#### 1. First Request (Initialize)
- Agent Builder sends initialize request with your Bearer token
- Your server responds with `mcp-session-id` header
- Agent Builder **automatically captures and stores** this session ID

#### 2. Subsequent Requests
- Agent Builder **automatically includes** `mcp-session-id` header in all future requests
- You never have to manually manage session IDs

#### 3. Session Lifecycle
- Agent Builder maintains the session for the entire conversation
- When conversation ends, it sends DELETE to clean up

### Example Flow (Behind the Scenes)

```
┌─────────────────┐                           ┌──────────────────┐
│ OpenAI Agent    │                           │ Your MCP Server  │
│ Builder         │                           │                  │
└────────┬────────┘                           └────────┬─────────┘
         │                                              │
         │ 1. Initialize (with Bearer token)           │
         ├─────────────────────────────────────────────>│
         │                                              │
         │ 2. Response (includes mcp-session-id)       │
         │<─────────────────────────────────────────────┤
         │   [Agent Builder stores: session-123]       │
         │                                              │
         │ 3. Call tool (auto-includes session-123)    │
         ├─────────────────────────────────────────────>│
         │                                              │
         │ 4. Tool response                             │
         │<─────────────────────────────────────────────┤
         │                                              │
         │ 5. Another tool call (auto-includes session)│
         ├─────────────────────────────────────────────>│
         │                                              │
         │ 6. DELETE session (when done)                │
         ├─────────────────────────────────────────────>│
```

### OpenAI Agent Builder Configuration

You only need to configure two things:

```
Server URL: http://localhost:3000/mcp  (or your ngrok URL)
Authentication: Bearer YOUR-TAGOIO-TOKEN
```

**That's it!** The Agent Builder MCP client automatically handles:
- ✅ Sending the initialize request
- ✅ Capturing the `mcp-session-id` from response headers
- ✅ Including it in all subsequent requests
- ✅ Sending DELETE when conversation ends

### Standard MCP Client Behavior

**All MCP clients** (not just OpenAI Agent Builder) must:
1. Capture `mcp-session-id` from initialization response
2. Include it in all subsequent requests
3. Use it for GET (SSE), POST (tools), and DELETE (cleanup)

This is defined in the MCP Streamable HTTP specification.

### What You Need to Ensure

For OpenAI Agent Builder to work correctly:

#### 1. CORS Headers Include `mcp-session-id`
Already configured in your implementation:
```typescript
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id, Last-Event-ID",
};
```

#### 2. Server is Publicly Accessible
Use ngrok or cloudflare tunnel for local testing:
```bash
# Install ngrok
brew install ngrok

# Expose your local server
ngrok http 3000

# Use the ngrok URL in Agent Builder
# Example: https://abc123.ngrok.io/mcp
```

#### 3. Bearer Token Authentication Works
Already implemented in `http-server.ts:144-176`.

### Verification in Server Logs

You can verify session management in your server logs:

**Session initialization**:
```typescript
// http-server.ts:181
onsessioninitialized: (newSessionId: string) => {
  console.info(`Session initialized: ${newSessionId}`);
}
```

**Session usage**:
```typescript
// http-server.ts:118
const sessionId = req.headers["mcp-session-id"];
if (sessionId && sessions[sessionId]) {
  // Agent Builder automatically sent the session ID!
}
```

### No Special Configuration Required!

The `mcp-session-id` is handled automatically by OpenAI Agent Builder and all MCP clients. Your server implementation already:
- ✅ Returns `mcp-session-id` in response headers
- ✅ Accepts it in subsequent requests
- ✅ Has proper CORS configuration

Using the MCP SDK (`StreamableHTTPServerTransport`) ensures all this protocol complexity is handled for you, guaranteeing compatibility with all MCP clients including OpenAI Agent Builder.

## Testing Your MCP Server

### Official Testing Tools

#### 1. MCP Inspector (Recommended)
**URL**: https://github.com/modelcontextprotocol/inspector

Official debugging and testing tool for MCP servers.

**Installation**:
```bash
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

**Features**:
- Test all MCP methods (initialize, tools/list, tools/call, etc.)
- View real-time JSON-RPC messages
- Inspect tool schemas and responses
- Debug SSE streams

#### 2. OpenAI Agent Builder (Production Testing)
**URL**: https://platform.openai.com/docs/actions

Create custom GPTs with MCP server integration.

**Requirements**:
- Server must be publicly accessible (use ngrok/cloudflare tunnel)
- Bearer token authentication

**Configuration**:
- Server URL: Your public URL + `/mcp`
- Authentication: Bearer token in settings

### Manual Testing with cURL

#### Step 1: Initialize Session
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR-TAGOIO-TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "curl-client",
        "version": "1.0.0"
      }' -v
```

**Extract the `mcp-session-id` from response headers!**

#### Step 2: List Available Tools
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: SESSION-ID-FROM-STEP-1" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

#### Step 3: Call a Tool
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: SESSION-ID-FROM-STEP-1" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "device-list",
      "arguments": {
        "amount": 5
      }'
```

#### Step 4: Test SSE Stream (Separate Terminal)
```bash
curl -N -H "mcp-session-id: SESSION-ID" \
  http://localhost:3000/mcp
```

### GUI Testing Tools

#### Postman
**Download**: https://www.postman.com/downloads/

**Workflow**:
1. Create initialize request (POST with Authorization header)
2. Save session ID from response header
3. Use session ID in subsequent requests
4. **Advantage**: Easy to save and replay requests

#### Insomnia
**Download**: https://insomnia.rest/download

Similar workflow to Postman with better SSE support for testing GET streams.

### Making Your Server Publicly Accessible

#### Using ngrok
```bash
# Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com/download

# Start your MCP server
node build/index.js http

# In another terminal, expose it
ngrok http 3000

# Use the ngrok URL in OpenAI Agent Builder
# Example: https://abc123.ngrok.io/mcp
```

#### Using Cloudflare Tunnel
```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# Start tunnel
cloudflared tunnel --url http://localhost:3000
```

### Recommended Testing Approach

**For Development**:
1. Start with **cURL** for basic functionality testing
2. Use **MCP Inspector** for detailed debugging
3. Use **Postman/Insomnia** for organized test collections

**For Integration Testing**:
1. Use **ngrok** to expose locally
2. Test with **OpenAI Agent Builder** (real-world scenario)

**For Production**:
1. Deploy to a server with public IP
2. Configure proper authentication
3. Test with actual MCP clients (OpenAI GPTs, etc.)

### Troubleshooting

#### Common Issues

**401 Unauthorized**:
- Check Bearer token is valid
- Verify `Authorization: Bearer TOKEN` format
- Test token with TagoIO API directly

**400 Bad Request: No valid session ID**:
- Ensure you're including `mcp-session-id` header
- Verify session ID matches the one from initialization
- Check session hasn't expired

**CORS Errors**:
- Verify CORS headers include `mcp-session-id`
- Check server allows origin `*` or your specific domain
- Ensure preflight OPTIONS requests are handled

**SSE Stream Not Working**:
- Confirm session ID is valid
- Check firewall isn't blocking long-lived connections
- Verify `curl -N` flag is used (no buffering)

## Summary

### Why This Implementation?

1. **MCP Compliance**: Follows MCP Streamable HTTP specification (2025-03-26)
2. **JSON-RPC 2.0**: Required by MCP for structured, interoperable messages
3. **Multi-Method Support**: Each HTTP method serves a specific protocol purpose
4. **Bearer Auth**: Industry-standard authentication for HTTP APIs
5. **Session Management**: Enables stateful, multi-tenant MCP server

### Key Takeaways

- **Always use JSON-RPC 2.0 format** for all responses, even errors
- **All four HTTP methods** (POST, GET, DELETE, OPTIONS) are essential for full functionality
- **Session ID** is the security boundary after initial Bearer token authentication
- **Each session** maintains isolated Resources instance for multi-tenant support
- **`mcp-session-id` header** bridges HTTP's stateless nature with MCP's stateful requirements
- **OpenAI Agent Builder** and all MCP clients handle session management automatically
- **Testing tools** like MCP Inspector and cURL make development easier

For implementation details, see [src/server/http-server.ts](src/server/http-server.ts).
