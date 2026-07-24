# AGENTS.md

Repository instructions for coding agents working on this codebase. `CLAUDE.md` is a symlink to this file.

Path-specific rules live in nested `AGENTS.md` files; read the one under the directory you are touching in addition to this root:

- `src/services/dashboards/AGENTS.md` - dashboard/widget mutation-merge contract, custom-widget code tools, schema lookup/validation, layout ownership, dashboard-schema dependency.
- `src/services/analysis/AGENTS.md` - safe projection, SSRF-guarded source fetch, run/console semantics, update/delete constraints.
- `src/services/entities/AGENTS.md` - stricter-than-SDK entity contract and index-coupled entity-data rules.
- `src/services/run-users/AGENTS.md` - write-only passwords and the `login_as_run_user` expiry clamp.
- `src/services/docs/AGENTS.md` - official-docs teaching tools and the credential-specific device-data routes.
- `src/services/documentation/AGENTS.md` - code-example tool bounds, coverage matching, and public-content caching.
- `src/services/integration/AGENTS.md` - connector/network search filter exception.
- `src/evals/AGENTS.md` - frozen-dataset discipline and offline-vs-provider gating.

## Project Overview

This is a Model Context Protocol (MCP) server for TagoIO, enabling AI models to interact with TagoIO accounts for device management, data analysis, and platform integration. The server is built with TypeScript and uses the MCP SDK to provide tools for accessing TagoIO resources.

## Development Commands

- **Build**: `pnpm run build` - Compiles TypeScript to JavaScript in the `build/` directory
- **Test**: `pnpm test` - Runs all tests using Vitest
- **Test single file**: `pnpm run test:single [filename]` - Run tests for a specific file. Pass the filename directly, with no `--` separator: pnpm forwards `--` literally and vitest drops everything after it, silently running the whole suite
- **Lint**: `pnpm run linter` - Check code quality with oxlint
- **Lint and fix**: `pnpm run linter-fix` - Auto-fix linting issues
- **Format**: `pnpm run format` - Format source files with oxfmt
- **Format check**: `pnpm run format-check` - Verify formatting without writing
- **Development**: `pnpm start` - Run the server in development mode with tsx

## Architecture

### Core Structure

The application follows a modular service-based architecture:

```
src/
├── index.ts                 # CLI entry point (stdio/http mode selection)
├── interfaces.ts            # JSON-RPC interfaces
├── server/                  # Transports + buildServer(context) composition root
├── services/                # Domain tool modules and the flattened tool catalog
├── testing/                 # MSW mocks, fixtures, and test helpers
└── utils/                   # Shared utilities and models
```

`skills/custom-widget-development/SKILL.md` (repo root) teaches the custom-widget authoring contract to MCP clients; a test validates its examples against its own rules.

### Composition Root

`server/build-server.ts` exposes `buildServer(context)`, the only place tools are registered. All three transports (stdio in `server/stdio-server.ts`, HTTP in `server/http-server.ts`, AWS Lambda in `server/lambda-handler.ts`) construct the MCP server through it, so they expose identical metadata, instructions, and tools. Every transport resolves its request context through the single `buildServerContext` boundary in `server/shared.ts`. The `ServerContext` (`services/types.ts`) carries the request-scoped SDK `Resources`, token, credential context, and region; tool handlers never read credentials or region from process env.

### Credentials

Credentials are classified once at context construction and rejected before any outbound request when unsupported. Exactly three kinds are supported:

- **Profile tokens** (`p-` prefix): full account access.
- **Analysis tokens** (`a-` prefix): access scoped to what the analysis can reach.
- **Device tokens** (unprefixed): device-data-only and identity-bound. Token introspection resolves the device the token authenticates, the context carries that `authenticatedDeviceId`, and the device-data tools reject any other supplied `device_id` before any data request. Device tokens are used directly, never translated via token listing.

Every other prefix, including `at` Service Authorization tokens, is rejected at classification.

### Regions and Endpoints

- HTTP/Lambda accept only allowlisted `x-tagoio-region` short codes: `us-e1` or `eu-w1`. Arbitrary URLs or hosts in the header are rejected before any outbound request (SSRF guard).
- Dedicated (TagoDeploy) endpoints are trusted operator startup configuration only: stdio mode with the `TAGOIO_API` environment variable (`https://` only), never request input.

### Service Architecture

Each service module follows a consistent pattern:

- **Tool implementations** (`services/[service]/tools/`) - Individual tool logic with Zod schemas, exported as `IToolConfig` (name, title, description, schema, annotations, mutation class, handler)
- **Domain array** (`services/[service]/tools/index.ts`) - The domain's tool configs
- **Catalog** (`services/catalog.ts`) - Flattens all domain arrays once; consumed by MCP registration and test/eval tooling
- **Tests** (`services/[service]/tools/tests/`) - Vitest test files

### Key Domains

1. **Devices** - Device management (search/get/create/update/delete/configure) and device-data tools (read/send/edit/delete)
2. **Actions** - Automation search/get/create/update/delete
3. **Analysis** - Management, script upload/download, run triggering, console reading. See `services/analysis/AGENTS.md`.
4. **Entities** - Management, the `update_entity_schema` changeset, and index-coupled entity-data tools. See `services/entities/AGENTS.md`.
5. **Run Users** - TagoRUN user management, per-user notifications, and `login_as_run_user`. See `services/run-users/AGENTS.md`.
6. **Profile** - Profile info, limits, usage statistics, and secrets metadata
7. **Integration** - Connector and network search and retrieval. See `services/integration/AGENTS.md`.
8. **Docs** - Official-docs teaching tools. See `services/docs/AGENTS.md`.
9. **Documentation** - Code example search and retrieval over the public snippets catalog. See `services/documentation/AGENTS.md`.
10. **Dashboards** - Dashboard/widget CRUD, schema lookup and validation, and custom-widget code tools. See `services/dashboards/AGENTS.md`.

### Tool Design

Every tool is single-purpose with a `snake_case` `verb_noun` name (`search_devices`, `create_action`), a `title`, MCP behavior annotations, and a mutation class.

- **Resource-list search tools** (`search_devices`, `search_actions`, `search_analyses`, `search_dashboards`, `search_entities`, `search_run_users`, `search_secrets`) take `filter`/`page`/`amount`/`fields`/`response_format` and render concise tables with truncation steering. `fields` controls the rendered columns as well as the SDK query: no `fields` in concise mode renders the concise defaults; explicit `fields` renders exactly those fields even in concise mode; detailed mode renders every returned field. Some searches deviate from this contract; those exceptions are documented in the owning domain's `AGENTS.md`.
- Get tools take a 24-character resource ID.
- **Credential-safe output boundary**: `buildServer` wraps every tool call. Thrown failures are formatted through `utils/safe-error.ts` and rendered results pass through the same literal redaction, so the request credential never leaves the server even when the API reflects it (in errors, console output, or downloaded source). Handlers additionally redact operation-specific secrets the root cannot know: submitted environment-variable values, uploaded script source (plaintext and base64), minted analysis tokens, and signed URLs. Mutation success messages are controlled local confirmations, never interpolated SDK text; operations whose contract returns data (created IDs, device-data counts, rotation replacement tokens) return that data, not SDK acknowledgment strings.

Cross-field validation is a per-tool optional `crossFieldSchema`, applied unconditionally by the composition root after the SDK parses the tool's `parameters` shape and before the handler runs (`services/apply-cross-field.ts`; shared helper `utils/cross-field.ts`). Handlers no longer hand-validate cross-field rules. A failure throws the refinement's message, which still uses the actionable format (parameter, constraint, valid example) built by `utils/tool-errors.ts`, and flows through the same isError and credential-redaction path as a handler throw.

Device credential rotation (connector/network/serial changes) requires `confirm_token_rotation: true` and returns every replacement token; rotation failure detail is redacted through `utils/safe-error.ts` so old or request credentials never escape via errors.

Deliberately excluded from the catalog: TagoRUN environment administration (`run.info`/`run.edit`; `run.info` also returns an `anonymous_token` credential), SSO/custom-domain administration, `emailTest`, and anonymous-user creation.

### Environment Configuration

Environment variables (stdio mode):

- `TAGOIO_TOKEN` - TagoIO Profile, Analysis, or Device token (required). Device tokens enable only the device-data tools, scoped to the device they authenticate.
- `TAGOIO_API` - API endpoint (defaults to US: https://api.us-e1.tago.io); set it to a dedicated instance URL when applicable (https only)
- `LOG_LEVEL` - Set to "DEBUG" for verbose logging
- `NODE_ENV` - Set to "dev" for development logging

Env config is parsed through `utils/config.model.ts`, split into `stdioEnvSchema` (stdio startup) and `serverEnvSchema` (HTTP/Lambda). HTTP/Lambda modes take the token per request from the `Authorization` header and the region from `x-tagoio-region`.

### Schema Validation

All tools use Zod for input validation and type safety. Schemas are defined alongside tool implementations and include filtering capabilities for date ranges, ordering, and pagination.

### Testing Strategy

- Uses Vitest for testing; tests run from the `src/` directory as root (`vitest.config.ts`)
- Unit tests live in `services/[service]/tools/tests/`
- Per-tool MCP contract tests (`services/tests/tool-contract.test.ts`) call every catalog tool through an in-memory client/server pair backed by MSW fixtures, plus a tool-listing snapshot
- Transport smokes (`server/tests/`) cover stdio (spawned child with `testing/start-mock-stdio.ts`), HTTP, and Lambda representatively, not per-tool
- MSW handlers/fixtures live in `testing/mocks/`; unhandled SDK traffic fails tests (`onUnhandledRequest: "error"`)
- `pnpm run test:snippets:live` is a zero-secret, non-mutating smoke against the public snippets catalog (like `pnpm run test:docs:live`), separate from regular CI
- Eval harness gating lives in `src/evals/AGENTS.md`

### Key Dependencies

- `@modelcontextprotocol/sdk` - MCP server implementation
- `@tago-io/sdk` - TagoIO API client
- `@tago-io/dashboard-schema` - Dashboard/widget validation schemas (exact-pinned). Import rules and the engine floor it sets live in `services/dashboards/AGENTS.md`
- `zod` - Schema validation. MCP input schemas import the `zod/v3` subpath
- `ipaddr.js` - IP address classification for the analysis source-fetch SSRF guard (runtime, exact-pinned)
- `fast-check` - Property-based testing (dev)
- `oxlint` / `oxfmt` - Code linting and formatting
- `vitest` - Testing framework
- `msw` - API mocking for tests (Node interceptor mode)

`tsx` runs the dev entry point and the live smoke scripts. Node engine floor is `>=22.12.0`, set by the dashboard-schema require(esm) call (see `services/dashboards/AGENTS.md`).

## Code Style Guidelines

### Writing (this file and every nested AGENTS.md)

- No em-dashes. Use commas, parentheses, colons, or separate sentences.

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
- Never log or snapshot token values; format SDK failure detail through `utils/safe-error.ts` wherever a message could carry a credential

### TypeScript Guidelines

- Avoid explicit `any` types (generates info-level warnings)
- Use modules instead of namespaces
- No extra non-null assertions or unsafe optional chaining
