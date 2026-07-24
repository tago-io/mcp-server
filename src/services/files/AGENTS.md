# services/files

Listing and deletion of the profile's TagoIO Files storage: `search_files` and `delete_files`.

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

The domain exists because file objects outlive what created them. Deleting a widget or a dashboard removes no files, so custom-widget sources (`widgets/{widget_id}.tsx`) and bundled artifacts (`widgets/.bundled/{widget_id}/{hash}.html`) stay behind and keep consuming file storage. `upload_custom_widget_code` is the only other catalog tool that creates Files objects, and it cleans up its own prior artifacts on re-upload.

## Signed URLs are never resolved

`getFileURLSigned` returns a credential. No tool in this domain calls it, and neither list nor delete returns a URL of any kind.

Because a URL on a file entry would be a signed credential, `search_files` projects each entry onto a known field set (`filename`, `size`, `last_modified`, plus `public` in detailed mode) rather than rendering what came back. That is a deliberate deviation from the root contract's "detailed mode renders every returned field": an unrecognized field from this endpoint is never rendered. Adding a field means adding it to the projection.

## Paths are profile-relative

The API prefixes every key with the requesting token's own profile server-side, so a path cannot address another profile and no host or profile matching applies here (unlike the custom-widget `display.url` matrix in `services/dashboards`). Path validation exists for a different reason, below.

## Why deletion pre-flights a listing

The delete route head-checks each supplied path. An exact object key is deleted as a file; any other string is treated as a folder prefix and its whole subtree is deleted recursively, and a path that matches nothing is not an error. One mistyped character on a real file path is therefore a silent directory wipe, and no path syntax can prevent it: a folder may legitimately be named `reports.csv`.

So `delete_files` proves each path is a file before deleting anything:

- Every path is normalized and validated first (`file-paths.ts`): one optional leading slash, no traversal, no empty or untrimmed segments, no wildcards, no control characters, no trailing slash, length capped. Untrimmed segments are rejected rather than trimmed, because the API trims them and would otherwise resolve a different key than the one verified. Malformed input never reaches the API.
- Each validated path is then listed. The listing is a prefix query on the full path, and an exact key always sorts before every other key sharing it as a prefix, so one small page is enough to decide. The path must come back in `files`; if it comes back as a folder, or not at all, the call is refused.
- Verification is all or nothing across the batch (capped at 20 paths), so a call can never half-delete.
- Success returns a locally built confirmation listing exactly the verified paths and the bytes freed, never SDK text.

Residual risk, unavoidable through this API: a file deleted by someone else between the listing and the delete would fall back to the recursive path, which then matches only a folder of that exact name.

Deletion takes no confirm flag, consistent with the house rule that plain resource deletes rely on tool annotations and client-side approval. The confirm-flag exception (`confirm_token_rotation`) guards collateral destruction hidden inside an operation; here the collateral case is removed structurally instead.

## Search contract deviation

`search_files` does not follow the resource-list search shape. The list endpoint is an S3 prefix listing: no `filter`, no ordering, no page numbers, no total row count. It takes `path`, `amount` (the API's `qty`), and an opaque `pagination_token` cursor, and returns one folder level.

- `filename` is the full profile-relative path, not a base name; `folders` are bare last segments and are rendered back with their full path so they can be passed straight to `path`.
- Files and folders share the `amount` budget, because the underlying page size counts both.
- The endpoint also accepts a `search` substring filter, deliberately not exposed: it filters the fetched page after pagination, so it silently yields short pages and misses matches on later ones.
- The allocation and usage the endpoint reports alongside every page are rendered, so leftover files can be weighed against the profile's storage.

## Mock fidelity

`testing/mocks/file-storage.ts` is a stateful mock that reproduces the prefix listing and, importantly, the destructive delete fallback. A test that lets a folder or a non-existent path through sees the subtree actually disappear from the mock, so the guard cannot regress into a passing test.
