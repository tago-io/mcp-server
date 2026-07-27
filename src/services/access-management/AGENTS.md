# services/access-management

Access Management policies: `search_access_policies`, `get_access_policy`, `lookup_access_permissions`, `create_analysis_access_policy`, `create_run_user_access_policy`, `update_analysis_access_policy`, `update_run_user_access_policy`, `delete_access_policy`.

The write tools are split by target kind and the read tools are not, because reading is how you discover a policy's kind in the first place. Both write variants come from one factory in `tools/policy-write.ts`, so they cannot drift in behaviour, and the prose they share is interpolated from constants: the platform's own agent tooling made the same split with two hand-written descriptions, and those have already fallen out of step with its catalog.

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

The domain exists because an analysis built entirely through this server fails at runtime with "Authorization Denied" and the reason is invisible from inside the tool surface. An analysis using the SDK's `Resources` class holds no permissions of its own, so every resource it touches needs a policy granting it, and until this domain existed a policy could only be written by hand in the Admin console.

The two target kinds fail differently, and the tool text names both. An analysis gets the error; a `run_user` does not. List routes filter to what the token may see rather than refusing, so an ungranted run user calling `GET /dashboard` gets `200` with an empty result. Verified live: zero policies, 0 dashboards; one policy granting `dashboard`/`access` by id, exactly 1; a second run user with no grant, still 0; deleting the policy, back to 0. The empty list IS the denial, and it is the diagnostic dead end this domain exists to remove, since nothing about it points at Access Management.

## Who Access Management applies to

Policies govern `analysis` and `run_user` tokens, and nothing else.

- **Profile tokens bypass Access Management entirely.** A profile token resolves its profile directly and never consults a policy, so nothing in this domain constrains what this server can do, and no policy can lock a profile token out of cleaning up after itself.
- **Dashboard tokens do not participate at all.**

That asymmetry is worth stating in tool descriptions, because the obvious reading (that a policy protects the MCP server too) is wrong in both directions: a profile token can write any policy, and no policy restricts it.

## Why the write tools are split by kind

The two kinds are not two views of one permission list. Five resource NAMES appear under both (`device`, `entity`, `dashboard`, `run_user`, `sql`), with different action sets: `dashboard` offers a run user `access` and `arrangement`, and an analysis `access` plus six others. The overlap is partial and cannot be assumed, which is the trap. `arrangement` exists only for run users; `duplicate`, `related_devices` and `related_analysis` only for analyses. A merged tool has to accept the union and reject the impossible pairings afterwards, which is validation standing in for a distinction the tool could simply have made.

The stronger reason is an over-grant. The API validates each target on its own and never correlates a target to the rules beside it, so one policy may legally hold both an `analysis` and a `run_user` target. The target kind is a WHERE clause that selects the policy and is then discarded: the permission list is re-fetched by policy id alone, and no evaluation code reads a policy's targets at all. A policy holding both kinds therefore grants its entire rule list to both, in both directions, and a rule written for the analysis silently reaches the co-targeted run users. The old merged tool accepted this, because it passed a rule that was meaningful for at least one of the policy's kinds, which is right for a single-kind policy and too permissive for a mixed one. A tool whose kind is fixed cannot express that policy at all.

Nothing server-side treats this as a mistake. No schema, migration, comment, or type expresses the single-kind rule, and a Rust schema test asserts a policy with one `run_user` and one `analysis` target validates. The Admin console appears to pin one kind per policy, and the platform's own agent tooling binds it at registration exactly as these tools do, so the shape is reachable only from a direct API call. Assume such a policy came from somewhere else rather than from a tool that meant it.

Because a kind is bound to a tool, a policy cannot be repointed from one kind to the other in place. That is a real capability removal, and it is the right trade: keeping rules across such a move is exactly what produces a policy that reads correctly and grants nothing. Moving a policy means deleting it and creating the replacement, which both update tools say.

## How rules are evaluated

There is no single evaluator, and the three the platform has resolve a cross-policy deny differently. A blanket claim in either direction is wrong somewhere, so the tools describe the split.

- **Listing resources** goes through `providers/db-functions/am-parser.ts`, which builds `WHERE (allow clauses) AND NOT (deny clauses)`. That is set algebra: every deny applies, whatever policy holds it, in any row order. This is the path behind most of what a policy visibly governs, and it backs `device`, `analysis`, `run_user` and notification listings alike.
- **Authorizing one operation on one resource** goes through `matchAMPermissions`: a request starts denied, matching rules overwrite the verdict, and the LAST one decides. Rules arrive sorted allow-before-deny per policy, so within one policy a deny beats an allow, but policies are concatenated in unspecified row order, so a deny in a different policy may or may not win.
- **The Rust run-user path** (`packages/access-management-rs`, used by realtime SSE) fetches every matched policy's permissions in one query ordered by effect, so deny wins globally there too.

Two consequences shape what the read tools may claim. The info route returns a policy's rules sorted by effect, so the order rules are written in is not the order they come back in, and a tool rendering them in submission order misreports which one is responsible. And the only advice reliable on all three paths is to keep a deny in the same policy as the allow it limits, which is what `EVALUATION_NOTE` says.

For the same reason no tool simulates a verdict. Answering "would this token be allowed" means reimplementing the platform's matcher, which can drift from it, and being confidently wrong exactly in the case the platform itself does not define. The tools render what a policy says and name the grant an operation needs; the caller reasons from that.

## The wire grammar, and why input does not mirror it

A permission's `resource` and a policy's `targets` are bare string tuples on the wire, classified by arity and separator words: `[type]` is any, `[type, "id", <id>]` is one resource, `[type, "tag.key", k, "tag.value", v]` is a tag pair, `[type, "tag_match", k]` is a tag key, and `[type, "path", p]` is a storage prefix. A tuple of any other arity up to five is stored, classified as nothing, and silently grants nothing. Longer than five is worse: the provider persists only positions 0 to 4, so a six-element tuple is truncated into a shape the parser accepts and a rule the caller did not write can start matching.

Be precise about what the API does and does not check, because it decides what a failure here means. It DOES refine `resource[0]` against its resource list, each target's first entry against `run_user`/`analysis`, and every action against a closed enum, so a misspelled resource or action name is rejected upstream. What it never checks is the tuple's arity, its separator words, and whether the resource and action belong together. Those three are the whole gap, and they are the ones that fail silently.

`tag_match` means different things in the two positions, so the two schemas describe it differently. On a permission rule it compares values: the resource must carry the same value for that key as the target does. On a target it only requires that the analysis or run user CARRY the key; no value comparison happens (`getPolicyByTarget`).

The tools therefore accept a tagged `match` object and build the tuple in `policy-rules.ts`, which makes the broken arities unrepresentable. Targets use a separate schema without `path`, because the target lookup has no path branch and a path target would resolve to no policy at all. A target is a bare match spec rather than a `{type, match}` pair, since the kind comes from the tool that is running.

## Why writes are validated before the wire

The API's action enum and resource enum are independent, so `{resource: ["device"], action: ["login_as_user"]}` is accepted, saved, and inert. So is a match form a grant does not accept, such as scoping device `create` to a single device id when no device exists yet to carry it. Both produce a policy that exists, reads correctly, and does nothing, which is the failure this domain was opened to make diagnosable. Creating one would reproduce the bug, so every create and update tool refuses them.

`get_access_policy` marks the same shapes on policies that already contain them, since a policy that arrived by any other route can carry them too. A rule is INERT only when nothing in it can fire; a rule whose actions are part live is PARTLY INERT, because calling it dead would hide a permission the policy really does grant. When a policy has no target the platform can resolve, the per-rule verdicts are suppressed entirely and the targets section carries the reason, rather than repeating a misleading cause on every rule.

## The permission catalog is fetched, never vendored

The resource, action, and match-form matrix comes from `GET /am/settings`, the one Access Management route the SDK does not wrap. It is fetched rather than snapshotted because the write tools validate against it: a stale copy would reject a newly valid grant and accept a retired one, which is the one thing a rejection check cannot be built on. It also carries the labels and descriptions the Admin console shows, which is what turns a denial into the name of the grant to add.

`permission-catalog.ts` is the only non-SDK request in this domain and is deliberately not a generic authenticated-request escape hatch: the path is a constant, no caller input reaches the URL, and the response describes the permission model rather than any profile's data. It is not cached; one small request per call is cheaper than a shared mutable cache keyed by region.

The "valid example" a refusal offers is built from the catalog, not hardcoded, because a fixed example can name the very pairing the message just refused: `device` / `send_data` is valid for an analysis and meaningless for a run user, so offering it to a run user sends the caller back into the same rejection. The example names no `match`, which the tools read as `any`, and that is sound only while every grant accepts `any`. Every grant in the catalog does today. If one ever ships without it, an example naming that grant becomes refusable in turn, and fixing it means emitting a `match` too, which requires inventing a plausible id, tag pair, or path. That is deliberately not built while no such grant exists.

Reads degrade, writes do not. `get_access_policy` without the catalog still renders the policy, with raw wire values instead of console names, and says the pairing was not checked. A write without it fails and says to retry. Letting the write through with a warning reads like the friendlier option and is not: the warning can only tell the caller to verify with `get_access_policy`, which needs the same route that just failed, so it would store an unverifiable policy and offer no way to check it. Creating a policy is not urgent enough to be worth that.

## Update replaces, it does not merge

`permissions` and `targets` are replaced wholesale when present and untouched when absent, because the provider deletes every row and reinserts what was sent. There is no partial edit. An update renders the policy before and after whenever either key is supplied, so the replacement is visible.

An update reads the policy first on EVERY path, including a rename. The tool's name asserts which kind of policy it edits, and it cannot honour that claim without seeing the stored targets. Letting a rename through unchecked would mean `update_analysis_access_policy` succeeding on a run-user policy for one field and refusing it for another, which is a worse contract than one extra read. It refuses a policy whose stored kind is the other one, naming the tool that owns it, and refuses a mixed policy outright, since replacing its targets would silently drop one kind. A policy with no resolvable target is owned by neither and either tool may repair it by supplying targets.

Validating a submitted rule list fails closed; labelling a rendered diff degrades, and says so with the same note `get_access_policy` uses. Submitting rules also requires the policy to have a target the platform can resolve, because rules on a policy no token can match are the artefact this domain exists to prevent; a create always supplies targets, so this only catches an update replacing the rules of a policy whose stored targets are malformed.

A targets-only change submits no rule to judge, so it runs no catalog check. The one case where that change alters liveness is repairing a policy whose stored targets resolve to nothing, since either tool may claim such a policy: rules kept across that repair can land under a kind that cannot honour them. Nothing goes from live to dead, because a policy no token matched had no live grant to lose, and the After diff marks the survivors INERT. The pre-split tool behaved identically here.

What that leaves unchecked is stated rather than implied: a rule scoped by `tag_match` can still stop matching when the new targets do not carry the tag, which depends on the targets' own data rather than on the permission model. Detecting it would mean evaluating concrete tags on both the targets and the resources, which is the verdict simulation this domain declines to build.

An action is only called dead when every grant that could serve it can be judged. A grant the catalog ships with no match forms leaves the answer unknown, and unknown is not dead: refusing it would produce an error naming no acceptable form at all, in exactly the drift scenario that fetching rather than vendoring exists to survive.

Locally built rule lists are rendered allow-first before being shown, because a read arrives already sorted that way and a rule list we assembled has not been. Rendering it as submitted would show an order the platform never evaluates in, under a note saying the last match decides.

## Search contract deviation

`search_access_policies` follows the resource-list search shape, with one exception: the list route reads only the policy table, so it returns neither `permissions` nor `targets` at any `fields` value. Those are absent from the `fields` enum rather than advertised and permanently empty, and every result steers to `get_access_policy`, which is the only source of a policy's rules.

That limitation has a second consequence now the write tools are split: a search result cannot say which kind a policy targets, so it cannot say which update tool edits it. `get_access_policy` names the owning tool, which is why both update descriptions send the caller there first.

Rules are rendered as an ordered list, not a table. The order is load-bearing, and tag keys and values are free-form user text that the shared markdown table renderer does not escape.

## Mock fidelity

`testing/mocks/am-policies.ts` is a stateful mock that reproduces the behaviours a canned fixture would hide: the list projection that cannot return rules or targets, the info route's re-sort by effect, the wholesale replacement on edit, the storing of malformed or unmatchable tuples without complaint, and the provider's truncation of a tuple to positions 0 to 4. The seed policies include a deny written before an allow, so a tool that echoed submission order fails, a policy holding all three inert shapes, and a policy targeting both kinds, which no tool here can produce and a direct API call still can.

The `amSettings` fixture carries `dashboard` and `sql` under both kinds with different action sets, because a subset holding only kind-exclusive resources would let a merged check pass every test it should fail.
