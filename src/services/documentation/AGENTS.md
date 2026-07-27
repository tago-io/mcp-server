# services/documentation

Code example search and retrieval (`search_code_examples`, `get_code_example`) over the public snippets catalog.

See the repo-root `AGENTS.md` for the cross-cutting tool-design and credential-safe-output rules this domain also obeys.

## No credential, one deadline

These tools read the public snippets catalog and never send the TagoIO credential. Each tool call runs under ONE 10 s operation deadline shared by all of its fetches (parallel indexes; sequential metadata then source).

## Search input shape

`search_code_examples` intentionally uses specialized inputs (`query`/`type` plus optional `runtime`) instead of the resource-list search contract.

## Byte bounds

Search output is byte-bounded on every path: a 512-byte query limit enforced before any fetch, per-field truncation, a 32 KiB whole-response budget with explicit omission steering, and controlled failure reporting. When indexes fail, the result names only the affected runtimes with retry guidance, never raw backend error text or external redirect content.

## Coverage-based matching

Matching is coverage-based and honest. Queries are normalized (stopwords dropped, plurals folded); adequate results match every meaningful term; majority-coverage results are labeled PARTIAL; and single-term lexical hits on multi-term queries return an explicit no-sufficient-match report instead of noise. Every result path steers callers away from inferring API routes or behavior an example does not demonstrate.

## Caching

Snippet indexes are cached in-process for 10 minutes, keyed by canonical index URL. These fetches are credential-free and tenant-independent, so the cache is safe. Failures are never cached.

## Commands

```bash
# Zero-secret, non-mutating smoke against the public snippets catalog, separate
# from regular CI.
pnpm run test:snippets:live
```
