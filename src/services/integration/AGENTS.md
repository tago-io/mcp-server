# services/integration

Connector and network search and retrieval.

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

## Search filter exception

`search_connectors` and `search_networks` follow the resource-list search conventions (`page`/`amount`/`fields`/`response_format`, concise tables with truncation steering) but take their `name`/`public` filters as top-level parameters rather than nested under `filter`.
</content>
