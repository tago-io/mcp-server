import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

import { makeTestContext } from "../../../../testing/context";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { SNIPPETS_SITE } from "../../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { resetSnippetIndexCache } from "../../snippets-backend";
import { getCodeExampleBaseSchema, getCodeExampleConfigJSON, runGetCodeExample } from "../get-code-example";

const context = makeTestContext();

beforeAll(() => mockServer.listen(strictListenOptions));
beforeEach(() => resetSnippetIndexCache());
afterEach(() => {
  mockServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => mockServer.close());

describe("getCodeExampleBaseSchema", () => {
  it("accepts the exact example from the tool description", () => {
    const match = getCodeExampleConfigJSON.description.match(/<example>([\s\S]*?)<\/example>/);
    expect(match).not.toBeNull();
    const example = JSON.parse(match![1].trim());
    expect(getCodeExampleBaseSchema.safeParse(example).success).toBe(true);
    expect(z.object(getCodeExampleConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  it("rejects an empty filename and unknown enum values", () => {
    expect(getCodeExampleBaseSchema.safeParse({ type: "analysis", runtime: "node-rt2025", filename: "" }).success).toBe(false);
    expect(getCodeExampleBaseSchema.safeParse({ type: "other", filename: "console.js" }).success).toBe(false);
    expect(getCodeExampleBaseSchema.safeParse({ type: "analysis", runtime: "brainfuck", filename: "console.js" }).success).toBe(false);
  });
});

describe("get_code_example handler", () => {
  it("returns the fenced source for an exact analysis filename", async () => {
    const result = await getCodeExampleConfigJSON.tool(context, { type: "analysis", runtime: "node-rt2025", filename: "console.js" });

    expect(result).toContain('Code example "Console Hello World"');
    expect(result).toContain("console.js");
    expect(result).toContain("runtime node-rt2025");
    expect(result).toContain(fixtures.snippetSourceConsole.trim());
    expect(result).toContain("```");
  });

  it("returns the fenced source for an exact payload-parser filename", async () => {
    const result = await getCodeExampleConfigJSON.tool(context, { type: "payload-parser", filename: "base64-decoder.js" });

    expect(result).toContain('Code example "Base64 decoder"');
    expect(result).toContain("runtime javascript");
    expect(result).toContain(fixtures.snippetSourceParser.trim());
  });

  it("steers to search_code_examples on an unknown filename without fetching any source", async () => {
    let sourceFetches = 0;
    mockServer.use(
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025/:filename`, () => {
        sourceFetches += 1;
        return HttpResponse.text("nope");
      })
    );

    await expect(getCodeExampleConfigJSON.tool(context, { type: "analysis", runtime: "node-rt2025", filename: "does-not-exist.js" })).rejects.toThrow(/search_code_examples/);
    expect(sourceFetches).toBe(0);
  });

  it("rejects a traversal-shaped index file_path without fetching it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mockServer.use(
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025.json`, () =>
        HttpResponse.json({
          runtime: "node-rt2025",
          schema_version: 1,
          generated_at: "2026-01-01T00:00:00.000Z",
          snippets: [
            {
              id: "evil",
              title: "Evil entry",
              description: "Traversal-shaped file path.",
              language: "javascript",
              tags: [],
              filename: "evil.js",
              file_path: "../../etc/passwd",
            },
          ],
        })
      )
    );

    await expect(getCodeExampleConfigJSON.tool(context, { type: "analysis", runtime: "node-rt2025", filename: "evil.js" })).rejects.toThrow(/unsafe file path/);
    // Only the index was fetched; the traversal-shaped source path never was.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a source file over the 1 MiB cap with a controlled error", async () => {
    mockServer.use(
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025/console.js`, () => HttpResponse.text("a".repeat(1024 * 1024 + 1), { headers: { "content-type": "application/javascript" } }))
    );

    await expect(getCodeExampleConfigJSON.tool(context, { type: "analysis", runtime: "node-rt2025", filename: "console.js" })).rejects.toThrow(/1 MiB limit/);
  });

  it("rejects type analysis without a runtime before any traffic", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(getCodeExampleConfigJSON.tool(context, { type: "analysis", filename: "console.js" })).rejects.toThrow(/runtime/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects type payload-parser with a runtime before any traffic", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(getCodeExampleConfigJSON.tool(context, { type: "payload-parser", runtime: "node-rt2025", filename: "base64-decoder.js" })).rejects.toThrow(/runtime/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("caches the index across two calls while the source is fetched every time", async () => {
    let indexFetches = 0;
    let sourceFetches = 0;
    mockServer.use(
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025.json`, () => {
        indexFetches += 1;
        return HttpResponse.json(fixtures.snippetsAnalysisIndex);
      }),
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025/console.js`, () => {
        sourceFetches += 1;
        return HttpResponse.text(fixtures.snippetSourceConsole, { headers: { "content-type": "application/javascript" } });
      })
    );

    await getCodeExampleConfigJSON.tool(context, { type: "analysis", runtime: "node-rt2025", filename: "console.js" });
    await getCodeExampleConfigJSON.tool(context, { type: "analysis", runtime: "node-rt2025", filename: "console.js" });

    expect(indexFetches).toBe(1);
    expect(sourceFetches).toBe(2);
  });

  it("sends no Authorization or token header to the snippets host", async () => {
    const seenHeaders: Array<{ authorization: string | null; token: string | null }> = [];
    mockServer.use(
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025.json`, ({ request }) => {
        seenHeaders.push({ authorization: request.headers.get("authorization"), token: request.headers.get("token") });
        return HttpResponse.json(fixtures.snippetsAnalysisIndex);
      }),
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025/console.js`, ({ request }) => {
        seenHeaders.push({ authorization: request.headers.get("authorization"), token: request.headers.get("token") });
        return HttpResponse.text(fixtures.snippetSourceConsole, { headers: { "content-type": "application/javascript" } });
      })
    );

    await getCodeExampleConfigJSON.tool(context, { type: "analysis", runtime: "node-rt2025", filename: "console.js" });

    expect(seenHeaders).toHaveLength(2);
    for (const headers of seenHeaders) {
      expect(headers.authorization).toBeNull();
      expect(headers.token).toBeNull();
    }
  });
});

describe("get_code_example total deadline", () => {
  function delayedIndex(delayMs: number) {
    mockServer.use(
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025.json`, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return HttpResponse.json(fixtures.snippetsAnalysisIndex);
      })
    );
  }

  function delayedSource(delayMs: number) {
    mockServer.use(
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025/console.js`, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return HttpResponse.text(fixtures.snippetSourceConsole, { headers: { "content-type": "application/javascript" } });
      })
    );
  }

  it("aborts the source fetch at the ORIGINAL deadline when metadata consumed most of the budget", async () => {
    delayedIndex(180);
    delayedSource(180);

    const started = Date.now();
    await expect(runGetCodeExample({ type: "analysis", runtime: "node-rt2025", filename: "console.js" }, 250)).rejects.toThrow(/console\.js|fetch/i);
    // One shared budget: the operation ends near 250 ms, not a second full
    // deadline for the source fetch.
    expect(Date.now() - started).toBeLessThan(430);
  });

  it("counts redirect time against the same budget", async () => {
    mockServer.use(
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025.json`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 180));
        return new HttpResponse(null, { status: 302, headers: { location: `${SNIPPETS_SITE}/analysis/node-rt2025-moved.json` } });
      }),
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025-moved.json`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 180));
        return HttpResponse.json(fixtures.snippetsAnalysisIndex);
      })
    );

    const started = Date.now();
    await expect(runGetCodeExample({ type: "analysis", runtime: "node-rt2025", filename: "console.js" }, 250)).rejects.toThrow(/fetch|read/i);
    expect(Date.now() - started).toBeLessThan(430);
  });

  it("still retrieves metadata and source normally within the budget", async () => {
    delayedIndex(20);
    delayedSource(20);

    const result = await runGetCodeExample({ type: "analysis", runtime: "node-rt2025", filename: "console.js" }, 2_000);
    expect(result).toContain("console.js");
  });
});
