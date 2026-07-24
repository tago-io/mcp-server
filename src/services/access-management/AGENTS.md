# services/access-management

Access Management policies: `search_access_policies`, `get_access_policy`, `lookup_access_permissions`, `create_access_policy`, `update_access_policy`, `delete_access_policy`.

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

The domain exists because an analysis built entirely through this server fails at runtime with "Authorization Denied" and the reason is invisible from inside the tool surface. An analysis using the SDK's `Resources` class holds no permissions of its own, so every resource it touches needs a policy granting it, and until this domain existed a policy could only be written by hand in the Admin console.

## Who Access Management applies to

Policies govern `analysis` and `run_user` tokens, and nothing else.

- **Profile tokens bypass Access Management entirely.** A profile token resolves its profile directly and never consults a policy, so nothing in this domain constrains what this server can do, and no policy can lock a profile token out of cleaning up after itself.
- **Dashboard tokens do not participate at all.**

That asymmetry is worth stating in tool descriptions, because the obvious reading (that a policy protects the MCP server too) is wrong in both directions: a profile token can write any policy, and no policy restricts it.

## How rules are evaluated

A request starts denied. The policies whose targets match the token are collected, their rules are pooled, and each rule that matches overwrites the verdict, so the LAST matching rule decides. This is not deny-overrides and not first-match, and a tool that renders rules in any other order misreports which one is responsible.

Two consequences shape what the read tools may claim:

- The info route returns a policy's rules sorted by effect, every allow before every deny. So inside one policy a matching deny beats a matching allow, and the order rules are written in is not the order they come back in.
- Across policies the pooling order is the order the underlying query happens to return, which is not specified. A deny in one policy and an allow in another therefore have no defined winner. `get_access_policy` says so rather than implying a resolution.

For the same reason no tool simulates a verdict. Answering "would this token be allowed" means reimplementing the platform's matcher, which can drift from it, and being confidently wrong exactly in the case the platform itself does not define. The tools render what a policy says and name the grant an operation needs; the caller reasons from that.

## The wire grammar, and why input does not mirror it

A permission's `resource` and a policy's `targets` are bare string tuples on the wire, classified by arity and separator words: `[type]` is any, `[type, "id", <id>]` is one resource, `[type, "tag.key", k, "tag.value", v]` is a tag pair, `[type, "tag_match", k]` compares the target's own tag value, and `[type, "path", p]` is a storage prefix. The API validates them as `z.array(z.string())` and nothing more, so a tuple of any other arity is stored, classified as nothing, and silently grants nothing.

The tools therefore accept a tagged `match` object and build the tuple in `policy-rules.ts`, which makes the broken arities unrepresentable. Targets use a separate schema without `path`, because the target lookup has no path branch and a path target would resolve to no policy at all.

## Why writes are validated before the wire

The API's action enum and resource enum are independent, so `{resource: ["device"], action: ["login_as_user"]}` is accepted, saved, and inert. So is a match form a grant does not accept, such as scoping device `create` to a single device id when no device exists yet to carry it. Both produce a policy that exists, reads correctly, and does nothing, which is the failure this domain was opened to make diagnosable. Creating one would reproduce the bug, so `create_access_policy` and `update_access_policy` refuse them.

`get_access_policy` marks the same three shapes INERT on policies that already contain them, since a policy written in the Admin console can carry them too.

## The permission catalog is fetched, never vendored

The resource, action, and match-form matrix comes from `GET /am/settings`, the one Access Management route the SDK does not wrap. It is fetched rather than snapshotted because the write tools validate against it: a stale copy would reject a newly valid grant and accept a retired one, which is the one thing a rejection check cannot be built on. It also carries the labels and descriptions the Admin console shows, which is what turns a denial into the name of the grant to add.

`permission-catalog.ts` is the only non-SDK request in this domain and is deliberately not a generic authenticated-request escape hatch: the path is a constant, no caller input reaches the URL, and the response describes the permission model rather than any profile's data. It is not cached; one small request per call is cheaper than a shared mutable cache keyed by region.

When the route cannot be read, the write tools still write. The grammar checks come from the API's own parser and always run; only the catalog checks are skipped, and the result says so. Failing closed would send the caller back to the Admin console, which is the complaint that opened this domain.

## Update replaces, it does not merge

`permissions` and `targets` are replaced wholesale when present and untouched when absent, because the provider deletes every row and reinserts what was sent. There is no partial edit. `update_access_policy` reads the policy first whenever either key is supplied, validates the new rules against the targets that will actually be in force (the new ones if supplied, otherwise the existing ones), and renders the policy before and after so the replacement is visible. A change that cannot drop rules makes no extra request.

## Search contract deviation

`search_access_policies` follows the resource-list search shape, with one exception: the list route reads only the policy table, so it returns neither `permissions` nor `targets` at any `fields` value. Those are absent from the `fields` enum rather than advertised and permanently empty, and every result steers to `get_access_policy`, which is the only source of a policy's rules.

Rules are rendered as an ordered list, not a table. The order is load-bearing, and tag keys and values are free-form user text that the shared markdown table renderer does not escape.

## Mock fidelity

`testing/mocks/am-policies.ts` is a stateful mock that reproduces the four behaviours a canned fixture would hide: the list projection that cannot return rules or targets, the info route's re-sort by effect, the wholesale replacement on edit, and the storing of malformed or unmatchable tuples without complaint. The seed policies include a deny written before an allow, so a tool that echoed submission order fails, and a policy holding all three inert shapes. Creation is capped at the free plan's limit of 5 policies.
