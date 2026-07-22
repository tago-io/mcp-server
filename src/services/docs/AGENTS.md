# services/docs

Official-docs teaching tools: `platform_overview`, `search_docs`, `read_doc`.

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

## Search input shape

`search_docs` intentionally uses specialized inputs (`query`/`limit`) instead of the resource-list search contract.

## Credential-specific device-data routes

`platform_overview` teaches the device-data routes that depend on the credential kind:

- Device token: `GET /data`, bound to the authenticated device.
- Profile/analysis token: `GET /device/:device_id/data`.
- There is no `GET /data/:device_id`.

It also teaches that Analysis access to device data comes from Access Management `get_data` policies.

## Caching

The docs llms.txt index and `read_doc` page bodies are cached in-process for 15 minutes after validation (pages LRU-capped at 20 entries). These fetches are credential-free and tenant-independent, so the cache is safe. Failures are never cached.
</content>
