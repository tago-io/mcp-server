# services/run-users

TagoRUN user management (search/get/create/update/delete), per-user notifications, and the clamped `login_as_run_user`.

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

## Write-only passwords

Run-user passwords are write-only inputs under the same sentinel-test discipline as analysis environment variables: accepted on create/update, never echoed in results, logs, snapshots, or errors.

- `create_run_user` states that new users default to inactive.
- `update_run_user` cannot change the email.
- `delete_run_user` is destructive and cascades the user's run_user tokens.

## login_as_run_user

A credential-minting mutation with destructive-annotation posture. It returns the minted token intentionally (a documented boundary like rotation tokens) and clamps expiry hard (`expiry-clamp.ts`):

- `expire_time: "never"` is rejected (minted tokens have no per-token revocation).
- Only relative minute/hour durations parse.
- The ceiling is 2 hours, the default is 1 hour.
- Unparseable input fails closed before any request.
</content>
