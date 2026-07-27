# services/integration

Connector and network search and retrieval.

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

## Search filter exception

`search_connectors` and `search_networks` follow the resource-list search conventions (`page`/`amount`/`fields`/`response_format`, concise tables with truncation steering) but take their `name`/`exclude_public_catalog` filters as top-level parameters rather than nested under `filter`.

`exclude_public_catalog` defaults to false. When true, the handler sends the upstream `filter.public` key; the API checks key presence and ignores the value (omit the key to include TagoIO's public catalog; send the key to exclude it). That presence-only behaviour is an upstream dependency; the tests record the mapping locally against a mock, so they cannot detect the API changing. Verifying it against the real API belongs to a token-gated live smoke, which does not exist yet.

Only-public listing is not expressible for an authenticated caller. The anonymous token-less route and a `filter[profile]` trick were both considered and deliberately rejected; `filter[profile]` returns owned-only rows, dropping the rows shared with the profile, which is a different axis from what the parameter name promises.

These list endpoints return rows with no total count, so catalog exclusion stays server-side: client-side filtering would yield short pages and defeat the renderer's truncation heuristic.
