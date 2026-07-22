# services/entities

Entity management (search/get/create/update/delete), the `update_entity_schema` changeset, and index-coupled entity-data tools (read/send/edit/delete/empty).

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

## Entity contract (stricter than the SDK types)

- Field types are exactly `string`/`text`/`int`/`float`/`json`/`timestamp` (no boolean).
- Field names match `^[a-z_]+$`; reserved `id`/`created_at`/`updated_at` fields are rejected as user fields.
- Indexes carry 1 to 5 schema-backed fields.
- `create_entity` sends bare `{type, required}` schema entries (the `action` discriminator exists only in the schema changeset).
- `update_entity` changes name/tags/payload_decoder only.
- `update_entity_schema` is a single changeset over `/entity/:id/schema` (field create/rename/toggle-required/delete, index create/delete). Field types are immutable (no server path exists), and the populated-entity "cannot add a required column" failure returns the documented workaround (add optional, backfill, then set required) as an actionable error.

## Index-coupled entity-data

- `read_entity_data` filters must form a left-to-right prefix of a chosen entity index, and `order_by` is `asc`/`desc` applied by the server to that index's last field. The SDK's `skip`/`startDate`/`endDate`/`order` params are server-ignored and not exposed.
- Amount is 1 to 10,000 (default 20).
- send/edit accept up to 100 rows with per-type value caps; `send_entity_data` upserts on `id`.
- `delete_entity_data` requires explicit row IDs and the server caps deletion at 10 IDs per request, which is why the destructive truncate `empty_entity_data` is part of the surface.
</content>
