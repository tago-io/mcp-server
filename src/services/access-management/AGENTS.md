# services/access-management

Access Management policies: `search_access_policies`, `get_access_policy`, `lookup_access_permissions`, `create_access_policy`, `update_access_policy`, `delete_access_policy`.

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

The domain exists because an analysis built entirely through this server fails at runtime with "Authorization Denied" and the reason is invisible from inside the tool surface. An analysis using the SDK's `Resources` class holds no permissions of its own, so every resource it touches needs a policy granting it, and until this domain existed a policy could only be written by hand in the Admin console.

The two target kinds fail differently, and the tool text names both. An analysis gets the error; a `run_user` does not. List routes filter to what the token may see rather than refusing, so an ungranted run user calling `GET /dashboard` gets `200` with an empty result. Verified live: zero policies, 0 dashboards; one policy granting `dashboard`/`access` by id, exactly 1; a second run user with no grant, still 0; deleting the policy, back to 0. The empty list IS the denial, and it is the diagnostic dead end this domain exists to remove, since nothing about it points at Access Management.

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

A permission's `resource` and a policy's `targets` are bare string tuples on the wire, classified by arity and separator words: `[type]` is any, `[type, "id", <id>]` is one resource, `[type, "tag.key", k, "tag.value", v]` is a tag pair, `[type, "tag_match", k]` is a tag key, and `[type, "path", p]` is a storage prefix. A tuple of any other arity is stored, classified as nothing, and silently grants nothing.

Be precise about what the API does and does not check, because it decides what a failure here means. It DOES refine `resource[0]` against its resource list, each target's first entry against `run_user`/`analysis`, and every action against a closed enum, so a misspelled resource or action name is rejected upstream. What it never checks is the tuple's arity, its separator words, and whether the resource and action belong together. Those three are the whole gap, and they are the ones that fail silently.

`tag_match` means different things in the two positions, so the two schemas describe it differently. On a permission rule it compares values: the resource must carry the same value for that key as the target does. On a target it only requires that the analysis or run user CARRY the key; no value comparison happens (`getPolicyByTarget`).

The tools therefore accept a tagged `match` object and build the tuple in `policy-rules.ts`, which makes the broken arities unrepresentable. Targets use a separate schema without `path`, because the target lookup has no path branch and a path target would resolve to no policy at all.

## Why writes are validated before the wire

The API's action enum and resource enum are independent, so `{resource: ["device"], action: ["login_as_user"]}` is accepted, saved, and inert. So is a match form a grant does not accept, such as scoping device `create` to a single device id when no device exists yet to carry it. Both produce a policy that exists, reads correctly, and does nothing, which is the failure this domain was opened to make diagnosable. Creating one would reproduce the bug, so `create_access_policy` and `update_access_policy` refuse them.

`get_access_policy` marks the same shapes on policies that already contain them, since a policy written in the Admin console can carry them too. A rule is INERT only when nothing in it can fire; a rule whose actions are part live is PARTLY INERT, because calling it dead would hide a permission the policy really does grant. When a policy has no target the platform can resolve, the per-rule verdicts are suppressed entirely and the targets section carries the reason, rather than repeating a misleading cause on every rule.

## The permission catalog is fetched, never vendored

The resource, action, and match-form matrix comes from `GET /am/settings`, the one Access Management route the SDK does not wrap. It is fetched rather than snapshotted because the write tools validate against it: a stale copy would reject a newly valid grant and accept a retired one, which is the one thing a rejection check cannot be built on. It also carries the labels and descriptions the Admin console shows, which is what turns a denial into the name of the grant to add.

`permission-catalog.ts` is the only non-SDK request in this domain and is deliberately not a generic authenticated-request escape hatch: the path is a constant, no caller input reaches the URL, and the response describes the permission model rather than any profile's data. It is not cached; one small request per call is cheaper than a shared mutable cache keyed by region.

The "valid example" a refusal offers is built from the catalog, not hardcoded, because a fixed example can name the very pairing the message just refused: `device` / `send_data` is valid for an analysis and meaningless for a run user, so offering it to a run user sends the caller back into the same rejection. The example names no `match`, which the tools read as `any`, and that is sound only while every grant accepts `any`. Every grant in the catalog does today. If one ever ships without it, an example naming that grant becomes refusable in turn, and fixing it means emitting a `match` too, which requires inventing a plausible id, tag pair, or path. That is deliberately not built while no such grant exists.

Reads degrade, writes do not. `get_access_policy` without the catalog still renders the policy, with raw wire values instead of console names, and says the pairing was not checked. A write without it fails and says to retry. Letting the write through with a warning reads like the friendlier option and is not: the warning can only tell the caller to verify with `get_access_policy`, which needs the same route that just failed, so it would store an unverifiable policy and offer no way to check it. Creating a policy is not urgent enough to be worth that.

## Update replaces, it does not merge

`permissions` and `targets` are replaced wholesale when present and untouched when absent, because the provider deletes every row and reinserts what was sent. There is no partial edit. `update_access_policy` reads the policy first whenever either key is supplied and renders it before and after, so the replacement is visible. A change that cannot drop rules makes no extra request.

Targets are validated even when no rule is submitted. Because the API keeps the rule list when its key is absent, repointing a policy from an analysis to a run user leaves every rule in place while making most of them meaningless, producing exactly the inert policy this domain exists to prevent. So a target change is checked against the rules that will survive it.

That check refuses only what the change NEWLY breaks, compared per action and by liveness rather than by the reason for deadness. A grant already dead grants nothing either way, and refusing it would make any policy that already contains one permanently uneditable, while comparing reasons is the wrong abstraction: the same action can be dead before because its match form is rejected and dead after because the action does not exist, which is not a regression. Liveness is per action rather than per rule because a repoint that leaves a rule with one working action out of three has still silently taken two away, which is the same partial loss the renderer reports as PARTLY INERT. Rules stored in a shape the platform cannot parse are left out of the comparison for the same reason as dead ones.

The check sees only what the catalog can express. A rule scoped by `tag_match` can still stop matching after a repoint because the new targets do not carry the tag, which depends on the targets' own data rather than on the permission model, and detecting it would mean evaluating concrete tags on both the targets and the resources, which is the verdict simulation this domain declines to build. The tool description says what the check covers instead of implying more.

An action is only called dead when every grant that could serve it can be judged. A grant the catalog ships with no match forms leaves the answer unknown, and unknown is not dead: refusing it would produce an error naming no acceptable form at all, in exactly the drift scenario that fetching rather than vendoring exists to survive.

Locally built rule lists are rendered allow-first before being shown, because a read arrives already sorted that way and a rule list we assembled has not been. Rendering it as submitted would show an order the platform never evaluates in, under a note saying the last match decides.

## Search contract deviation

`search_access_policies` follows the resource-list search shape, with one exception: the list route reads only the policy table, so it returns neither `permissions` nor `targets` at any `fields` value. Those are absent from the `fields` enum rather than advertised and permanently empty, and every result steers to `get_access_policy`, which is the only source of a policy's rules.

Rules are rendered as an ordered list, not a table. The order is load-bearing, and tag keys and values are free-form user text that the shared markdown table renderer does not escape.

## Mock fidelity

`testing/mocks/am-policies.ts` is a stateful mock that reproduces the behaviours a canned fixture would hide: the list projection that cannot return rules or targets, the info route's re-sort by effect, the wholesale replacement on edit, the storing of malformed or unmatchable tuples without complaint, and the provider's truncation of a tuple to positions 0 to 4. The seed policies include a deny written before an allow, so a tool that echoed submission order fails, and a policy holding all three inert shapes. Creation is capped at the free plan's limit of 5 policies.
