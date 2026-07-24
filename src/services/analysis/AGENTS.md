# services/analysis

Analysis management (search/get/create/update/delete), script upload/download, run triggering, and console reading.

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

## Safe projection

General Analysis API responses render only through an allowlisted safe projection (`safe-projection.ts`): tokens, console output, and environment-variable values never reach general tool results. `token`/`analysis_token` properties are stripped recursively at any depth, and environment variables render as keys only. `read_analysis_console` is the sole console-exposing exemption and uses a dedicated projection that reads only console entries from the full info response.

## SSRF-guarded source fetch

Analysis script downloads go through a bounded SSRF-guarded fetch (`source-fetch.ts`):

- DNS pinning on every hop through a validating lookup handed to the socket, so the socket can only connect to an address that passed validation.
- Address classification is backed by `ipaddr.js`. An address is fetchable only when its range is unicast AND it is globally routable. Two positive constraints stay on top of the library because its unicast label is broader than global reachability: IPv4 must be a four-part decimal (rejecting shorthand like `1.2.3`), and IPv6 must fall inside global-unicast `2000::/3`. `ipaddr.js` natively rejects loopback, private, link-local, unique-local, CGNAT, multicast, broadcast, reserved, IPv4-mapped, NAT64, 6to4, and teredo. IPv4-mapped and NAT64 literals carrying a public embedded IPv4 are rejected outright rather than followed to the embedded address.
- https only, no embedded credentials, at most 3 manual redirects, identity transport encoding, 2 MiB raw / 1 MiB source caps, a single gzip pass, fatal UTF-8 decoding, and one total 10 s deadline covering everything.
- Discarded redirect/error bodies are destroyed immediately rather than drained. Signed download URLs are redacted from errors. The source fetch is never cached.

## Run and console semantics

- `run_analysis` is an asynchronous trigger acknowledgment only, with no completion status.
- `read_analysis_console` returns a bounded tail (last 200 entries / 64 KiB) in the order the API returns entries.

## Update and delete constraints

- `update_analysis` cannot change the runtime or run location.
- `delete_analysis` has no confirmation flag by design; the MCP client/operator owns destructive-call approval (the tool is annotated destructive).
</content>
