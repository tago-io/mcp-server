# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server for TagoIO, enabling AI models to interact with TagoIO accounts for device management, data analysis, and platform integration. The server is built with TypeScript and uses the MCP SDK to provide tools for accessing TagoIO resources.

## Development Commands

- **Build**: `npm run build` - Compiles TypeScript to JavaScript in the `build/` directory
- **Test**: `npm test` - Runs all tests using Vitest
- **Test single file**: `npm run test:single -- [filename]` - Run tests for a specific file
- **Lint**: `npm run linter` - Check code quality with Biome linter
- **Lint and fix**: `npm run linter-fix` - Auto-fix linting issues
- **Development**: `npm start` - Run the server in development mode with ts-node-dev

## Architecture

### Core Structure

The application follows a modular service-based architecture:

```
src/
├── index.ts                 # Main MCP server entry point
├── mcp-tools.ts            # Tool registration orchestrator
├── interfaces.ts           # JSON-RPC interfaces
├── authentication.ts       # TagoIO authentication logic
├── services/               # Service modules (devices, actions, etc.)
└── utils/                  # Shared utilities and models
```

### Service Architecture

Each service module follows a consistent pattern:

- **Handler function** (`services/[service]/index.ts`) - Registers MCP tools with the server
- **Tool implementations** (`services/[service]/tools/`) - Individual tool logic with Zod schemas
- **Tests** (`services/[service]/tools/tests/`) - Vitest test files

### Key Services

1. **Devices** - Device management, data operations, and deletion
2. **Actions** - TagoIO action lookup and management
3. **Analysis** - Data analysis and statistical operations
4. **Entities** - Entity data and operations
5. **Users** - User lookup and management
6. **Profile Metrics** - Account statistics and metrics
7. **Integration** - External integration management
8. **Documentation** - Code generation and documentation tools

### Operation Factory Pattern

The codebase uses a generic operation factory pattern (`utils/operation-factory.ts`) for routing different operation types to their handlers. This allows each tool to support multiple operations through a single MCP tool interface.

### Environment Configuration

Required environment variables:

- `TAGOIO_TOKEN` - TagoIO Profile or Analysis token (required)
- `TAGOIO_API` - API endpoint (defaults to US: https://api.us-e1.tago.io)
- `LOG_LEVEL` - Set to "DEBUG" for verbose logging
- `NODE_ENV` - Set to "dev" for development logging

### Schema Validation

All tools use Zod for input validation and type safety. Schemas are defined alongside tool implementations and include filtering capabilities for date ranges, ordering, and pagination.

### Testing Strategy

- Uses Vitest for testing with SWC compilation
- Test files are located in `services/[service]/tools/tests/`
- Global test configuration in `vitest.config.ts`
- Tests run from the `src/` directory as root

### Key Dependencies

- `@modelcontextprotocol/sdk` - MCP server implementation
- `@tago-io/sdk` - TagoIO API client
- `zod` - Schema validation
- `biome` - Code linting and formatting
- `vitest` - Testing framework

## Code Style Guidelines

### Programming Patterns

- **Functional programming**: Prefer functions over ES6 classes
- **Exports-last pattern**: Place export declarations at the end of files, separate from const declarations
- **Avoid default exports**: Exception for API controllers and SQL services only
- **Variable declarations**: Use `const` instead of `let` when variables are not reassigned
- **Array checks**: Use explicit length checks (`array.length > 0`) instead of truthy/falsy checks
- **Node.js imports**: Use `node:` prefix for built-in modules (e.g., `import fs from "node:fs"`)
- **Type assertions**: Prefer `as const` assertions over type assertions where appropriate
- **Iteration**: Use `for...of` loops instead of `forEach` methods

### Formatting

- Use trailing commas (ES5 style)

### Error Prevention

- No unused variables, labels, or unreachable code
- No empty block statements or duplicate object keys
- No fallthrough in switch cases
- Use `Error` constructor when throwing errors
- Use `Number.isNaN()` instead of comparing to `NaN`
- Use `Array.isArray()` instead of `instanceof Array`

### TypeScript Guidelines

- Avoid explicit `any` types (generates info-level warnings)
- Use modules instead of namespaces
- No extra non-null assertions or unsafe optional chaining
