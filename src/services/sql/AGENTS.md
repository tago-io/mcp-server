# services/sql

TagoSQL saved-query management (`search_sql_queries`, `get_sql_query`, `create_sql_query`, `update_sql_query`, `delete_sql_query`, `get_sql_query_version`), execution (`execute_sql_query`), and schema discovery (`lookup_sql_tables`) over `Resources.sql`.

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

## Edit is a full replace

`PUT /sql/{id}` replaces the whole query: a field missing from the body is reset (description to null, tags and params to empty, cache off, rate limit removed), and a body without `name` is refused. `update_sql_query` therefore reads the query first and resends every field in `EDITABLE_FIELDS` (`sql-schemas.ts`) with the caller's changes on top. Never send a sparse edit body. Explicit `null` (description, rate limit) must reach the body, so the merge tests `!== undefined`, not `??`. The API offers no precondition, so an edit made by someone else between the read and the write is overwritten; that is an accepted limit.

## Validation lives on the server

The API validates the SQL, the `$n` placeholders, and the plan limits on save, with messages specific enough to pass through unchanged (for example `Only SELECT statements are allowed`, `Placeholder numbering must be contiguous, missing $1`). Local checks cover only what the API would accept silently or that the schema can state: `$n` keys, unique keys, string values, `name` 1-64 characters, `description` at most 1024, `rate_limit_rpm` a positive integer or null, and `cache_ttl_seconds` at most 86400 (the API clamps a larger value instead of refusing it).

## Execution

- There is no unsaved execution; the descriptions teach the save, `test: true`, refine loop.
- `served_from_cache` is true only on a repeat with the same parameter values on a query with `cache_enabled`; `test: true` neither reads nor writes the cache. Fresh executions count against Data Output, which the descriptions and the result summary state.
- `render-execution.ts` renders rows in `columns[]` order within a 32 KiB budget (cells cut at 512 bytes on codepoint boundaries) and names how many rows were shown. The steering is `LIMIT` with a parameter cursor or `after_device`, not `page`: SQL results have no page parameter.
- An empty `columns` array is a valid result (a session-context query whose session resolves to nothing), not an error.
- A fleet query answers the error "No device found with tag" both when paging past its last device and when its tags match no active device (no `after_device`); the `execute_sql_query` description explains both.

## Access

A profile token runs everything. Analysis and TagoRUN tokens need Access Management grants on resource `sql` (`access` to read, `execute` to run, `ai_access` for the TagoRUN AI Chat), and the API refuses otherwise (403 `Authorization denied`, verified with a TagoRUN token on a query its policy does not match); no per-tool gating exists here. A grant returns the query's whole result, and an analysis cannot execute a query with session context.

## Commands

```bash
pnpm run test:single sql-tools
```
