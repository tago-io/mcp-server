# services/dashboards

Dashboard CRUD plus widget get/create/update/delete, `widget_schema_lookup`, the local development-loop `validate_widget_configuration`, and the custom-widget code tools. All validation runs locally through the pinned dashboard-schema adapter.

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

## Mutation-merge contract

Dashboard/widget mutations validate through `validation-adapter.ts`, the only module allowed to import `@tago-io/dashboard-schema`. There is no model-controlled way to skip validation; create/update validation runs on every mutation.

- Creates send the sanitized parsed configuration. `create_dashboard` validates locally (placeholder profile) before ANY SDK traffic, including the profile lookup.
- Updates take a compact caller patch, prefetch the current state, merge recursively (arrays replace atomically, explicit `null` clears, the widget `type` is immutable), and validate the full merged candidate.
- Dashboard updates send only the sanitized caller-supplied paths. Array items are projected pairwise against the caller-supplied item, so package-injected defaults inside array elements never transit.
- Widget updates send each caller-changed top-level object in its COMPLETE validated merged form, because the widget PUT replaces each top-level JSON column wholesale (no server-side merge; a sparse nested wire patch would wipe every sibling field). Scalars, arrays, and explicit nulls keep the sanitized patch value, and the current `analysis_run` is preserved on every wire update unless explicitly changed or cleared (the API detaches it whenever a PUT body omits it). Because a touched `display` goes out complete, stored Admin state such as `display.resource_options` and the bundler's `display.artifact_url` rides along unchanged; the package must model every key the Admin stores, or every update on that widget fails validation.
- Package-generated fields and the validation-only `profile` field never reach the SDK.
- Nullable layout state round-trips: `arrangement[].tab` and `tabs[].hidden` accept `null`, and collections clear with `[]`.

Dashboard/widget reads strip capability token fields (`utils/strip-token-fields.ts`) while preserving the rest of the configuration.

## Caller-written artifact_url

`display.artifact_url` is written by the bundler after `upload_custom_widget_code`. The package models it, so stored state validates, but `assertNoCallerArtifactURL` rejects it in a create candidate, an update patch, and a create-mode `validate_widget_configuration` candidate.

## Blueprint slots

`create_dashboard` takes `type` and the blueprint fields; a blueprint field without `type: "blueprint"` fails the cross-field check. `update_dashboard` refuses blueprint fields when the fetched dashboard is not a blueprint. `blueprint_devices` replaces atomically like `tabs`. A new slot is sent without `id`: the package generates one on parse, but projection drops it and the API assigns the real ID. An entity slot's `conditions` match entity tags, and a widget binds to a slot through its `resource` entry `id`. `get_dashboard` shows the blueprint fields in its concise view on blueprint dashboards, because callers need the slot IDs to keep slots and bind widgets.

## Duplicate-tab invariant

Duplicate dashboard tab keys fail through an independent local invariant in the adapter. The package's own tabs refine is ineffective, so do not rely on it.

## Custom-widget code tools

- `get_custom_widget_code` gates on the `iframe` type, validates `display.url` through the ported trusted-source matrix (region API/Files hosts only, profile-owned `/file/{profile}/…` and `/{profile}/storage/…` shapes, no traversal, `.tsx` only; `custom-widget-source.ts`), and fetches the source fresh through the signed-URL route and the SSRF-guarded bounded fetch. Empty URL or missing file returns bootstrap guidance, not an error.
- `upload_custom_widget_code` takes plain UTF-8 `.tsx` (extension fixed, 1 MiB local pre-request cap, base64-encoded internally) and renders every bundle outcome distinctly: success with warnings, bundle failure as a fixable caveat (source saved, previous artifact keeps rendering), feature-disabled/outdated deployments, quota (nothing mutated), and 429 with Retry-After and plan limits (free 1 / starter 10 / scale 30 per minute).
- Both requests go through `custom-widget-transport.ts`, a deliberately narrow module for exactly the upload POST and the signed-URL GET (the SDK wraps neither; URLs are built only from validated region config and 24-char ids). It is not a generic escape hatch.
- The credential, both source forms, and signed URLs are redacted from every thrown error. The tools never accept path or URL inputs.

The authoring contract these tools support is taught by `skills/custom-widget-development/SKILL.md` (self-checked by a test).

## Schema lookup and validation

- `widget_schema_lookup` serves one type/mode JSON Schema per call (128 KiB response cap, failing loudly rather than truncating), with the type list derived from the 40-entry schema map.
- `validate_widget_configuration` is a read-only local development-loop check (create or update mode, zero API traffic) against the same pinned adapter.

## Layout ownership

`update_dashboard` owns the `arrangement` (replaced atomically as a whole), `create_widget` returns an unplaced widget, and `delete_widget` refuses while the arrangement still references the widget.

## dashboard-schema dependency

`@tago-io/dashboard-schema` is exact-pinned and ESM-only, imported solely inside `validation-adapter.ts` via require(esm), which sets the Node `>=22.12.0` engine floor. Its Zod v4 stays inside the adapter (MCP input schemas remain on `zod/v3`).

## Commands

```bash
# After pnpm run build: proves the built CommonJS server can require the
# ESM-only dashboard-schema package. Run on the oldest supported Node and the
# current one when touching the adapter or the build chain.
pnpm run test:validator:node
```
