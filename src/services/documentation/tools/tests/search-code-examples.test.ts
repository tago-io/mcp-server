import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

import { makeTestContext } from "../../../../testing/context";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { SNIPPETS_SITE } from "../../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { resetSnippetIndexCache } from "../../snippets-backend";
import { MAX_RESPONSE_BYTES, runSearchCodeExamples, searchCodeExamplesBaseSchema, searchCodeExamplesConfigJSON } from "../search-code-examples";

const context = makeTestContext();

beforeAll(() => mockServer.listen(strictListenOptions));
beforeEach(() => resetSnippetIndexCache());
afterEach(() => {
  mockServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => mockServer.close());

function extractExample(description: string): unknown {
  const match = description.match(/<example>([\s\S]*?)<\/example>/);
  expect(match, "tool description is missing an <example> block").not.toBeNull();
  return JSON.parse(match![1].trim());
}

describe("searchCodeExamplesBaseSchema", () => {
  it("accepts the exact example from the tool description", () => {
    const example = extractExample(searchCodeExamplesConfigJSON.description);
    expect(searchCodeExamplesBaseSchema.safeParse(example).success).toBe(true);
    expect(z.object(searchCodeExamplesConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  it("rejects an empty query and missing required fields", () => {
    expect(searchCodeExamplesBaseSchema.safeParse({ query: "", type: "analysis" }).success).toBe(false);
    expect(searchCodeExamplesBaseSchema.safeParse({}).success).toBe(false);
    expect(searchCodeExamplesBaseSchema.safeParse({ query: "device" }).success).toBe(false);
    expect(searchCodeExamplesBaseSchema.safeParse({ type: "analysis" }).success).toBe(false);
  });

  it("rejects unknown type and runtime values", () => {
    expect(searchCodeExamplesBaseSchema.safeParse({ query: "device", type: "invalid-type" }).success).toBe(false);
    expect(searchCodeExamplesBaseSchema.safeParse({ query: "device", type: "analysis", runtime: "cobol-1959" }).success).toBe(false);
  });
});

describe("search_code_examples handler", () => {
  it("ranks a title match first", async () => {
    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "create a device", type: "analysis", runtime: "node-rt2025" });

    const rows = result.split("\n").filter((line) => line.startsWith("| ") && !line.includes("---") && !line.includes("| Title |"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toContain("Create a device");
    expect(rows[0]).toContain("create-device.js");
    expect(result).toContain("get_code_example");
  });

  it("searches all analysis runtimes when runtime is omitted", async () => {
    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis" });

    expect(result).toContain("console.js");
    expect(result).toContain("legacy-context.js");
    expect(result).toContain("node-rt2025");
    expect(result).toContain("node-legacy");
  });

  it("restricts results to the requested runtime", async () => {
    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis", runtime: "node-rt2025" });

    expect(result).toContain("console.js");
    expect(result).not.toContain("legacy-context.js");
  });

  it("searches the payload-parser javascript index", async () => {
    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "base64 decoder", type: "payload-parser" });

    expect(result).toContain("base64-decoder.js");
    expect(result).toContain("javascript");
    expect(result).toContain("omit runtime");
  });

  it("rejects runtime combined with payload-parser before any traffic", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(searchCodeExamplesConfigJSON.tool(context, { query: "base64", type: "payload-parser", runtime: "node-rt2025" })).rejects.toThrow(/runtime/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns per-runtime example counts when nothing matches", async () => {
    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "zzz-yyy-xxx", type: "analysis" });

    expect(result).toContain("No code example sufficiently matches");
    expect(result).toContain("node-rt2025 (4)");
    expect(result).toContain("node-legacy (1)");
    expect(result).toContain("deno-rt2025 (0)");
  });

  it('reports no sufficient match for "read device data" instead of presenting single-term hits', async () => {
    // The node-rt2025 catalog has device-list.js (matches "device" only) and
    // parse-payload.js (matches "data" only); neither demonstrates reading
    // historical device data, so neither may be presented as a match.
    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "read device data", type: "analysis", runtime: "node-rt2025" });

    expect(result).toContain("No code example sufficiently matches");
    expect(result).not.toContain("device-list.js");
    expect(result).not.toContain("parse-payload.js");
    expect(result).toContain("do not infer");
    expect(result).toContain("search_docs");
  });

  it('keeps the genuine create-device match for "create a device" and drops device-only hits', async () => {
    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "create a device", type: "analysis", runtime: "node-rt2025" });

    expect(result).toContain("Found 1 code example(s)");
    expect(result).toContain("create-device.js");
    expect(result).not.toContain("device-list.js");
    expect(result).not.toContain("PARTIAL");
  });

  it("strips stopwords so filler words neither dilute nor inflate coverage", async () => {
    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "how do I create a device please", type: "analysis", runtime: "node-rt2025" });

    expect(result).toContain("Found 1 code example(s)");
    expect(result).toContain("create-device.js");
    expect(result).not.toContain("device-list.js");
  });

  it("folds simple plurals so 'devices list' still matches the device-list example", async () => {
    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "devices list", type: "analysis", runtime: "node-rt2025" });

    expect(result).toContain("Found");
    expect(result).toContain("device-list.js");
  });

  it("labels majority-coverage results as PARTIAL when no example matches every term", async () => {
    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "parse payload history", type: "analysis", runtime: "node-rt2025" });

    expect(result).toContain("PARTIAL");
    expect(result).toContain("parse-payload.js");
    expect(result).toContain("may not demonstrate the combined task");
    expect(result).toContain("do not infer");
  });

  it("includes the no-inference steering on full-match results", async () => {
    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis", runtime: "node-rt2025" });

    expect(result).toContain("do not infer adjacent API routes");
  });

  it("ranks deterministically across repeated identical searches", async () => {
    const first = await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis" });
    const second = await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis" });

    expect(second).toBe(first);
  });

  it("degrades gracefully when a single index fails, naming the runtime", async () => {
    mockServer.use(http.get(`${SNIPPETS_SITE}/analysis/node-legacy.json`, () => new HttpResponse(null, { status: 500 })));

    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis" });

    expect(result).toContain("console.js");
    expect(result).not.toContain("legacy-context.js");
    expect(result).toContain("node-legacy index could not be fetched");
  });

  it("errors when every index fails", async () => {
    for (const runtime of ["node-legacy", "python-legacy", "node-rt2025", "python-rt2025", "deno-rt2025"]) {
      mockServer.use(http.get(`${SNIPPETS_SITE}/analysis/${runtime}.json`, () => new HttpResponse(null, { status: 500 })));
    }

    await expect(searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis" })).rejects.toThrow(/No snippets index could be fetched/);
  });

  it("bounds and sanitizes the all-index-failure error even under hostile oversized redirects", async () => {
    const sentinel = "hostile-redirect-sentinel";
    const hostileLocation = `https://evil.example/${sentinel}/${"x".repeat(10_000)}`;
    for (const runtime of ["node-legacy", "python-legacy", "node-rt2025", "python-rt2025", "deno-rt2025"]) {
      mockServer.use(http.get(`${SNIPPETS_SITE}/analysis/${runtime}.json`, () => new HttpResponse(null, { status: 302, headers: { location: hostileLocation } })));
    }

    const error = await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis" }).then(
      () => null,
      (caught) => caught as Error
    );

    expect(error).toBeInstanceOf(Error);
    const message = error!.message;
    expect(Buffer.byteLength(message, "utf8")).toBeLessThanOrEqual(MAX_RESPONSE_BYTES);
    expect(message).not.toContain(sentinel);
    expect(message).not.toContain("evil.example");
    for (const runtime of ["node-legacy", "python-legacy", "node-rt2025", "python-rt2025", "deno-rt2025"]) {
      expect(message).toContain(runtime);
    }
    expect(message).toMatch(/retry/i);
  });

  it("rejects an index over the 2 MiB byte cap with a controlled error", async () => {
    // 1.1M chars of "é" is under the 2 MiB character count but 2.2 MiB in UTF-8.
    const body = new TextEncoder().encode("é".repeat(1_100_000));
    mockServer.use(
      http.get(
        `${SNIPPETS_SITE}/analysis/node-rt2025.json`,
        () =>
          new HttpResponse(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(body);
                controller.close();
              },
            }),
            { headers: { "content-type": "application/json" } }
          )
      )
    );

    // The oversized index is the only index searched, so the controlled
    // all-failure report (runtime names only, no raw backend text) applies.
    await expect(searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis", runtime: "node-rt2025" })).rejects.toThrow(
      /No snippets index could be fetched \(affected: node-rt2025\)/
    );
  });

  it("rejects an oversized query before any fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(searchCodeExamplesBaseSchema.safeParse({ query: "q".repeat(600), type: "analysis" }).success).toBe(false);
    // Multibyte: 400 chars of "é" is 800 UTF-8 bytes, over the byte limit even
    // though the character count passes the schema.
    await expect(searchCodeExamplesConfigJSON.tool(context, { query: "é".repeat(400), type: "analysis" })).rejects.toThrow(/query/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the five-index worst case inside the whole-response byte budget with a well-formed table", async () => {
    // Each index is individually valid (< 2 MiB) but carries verbose
    // multibyte descriptions; unbounded rendering would compound to megabytes.
    const entries = Array.from({ length: 30 }, (_, index) => ({
      id: `console-${index}`,
      title: `Console example ${index} ${"🚀".repeat(40)}`,
      description: "é".repeat(20_000),
      language: "node",
      tags: ["console"],
      filename: `console-${index}-${"f".repeat(150)}.js`,
      file_path: `node-rt2025/console-${index}.js`,
    }));
    for (const runtime of ["node-legacy", "python-legacy", "node-rt2025", "python-rt2025", "deno-rt2025"]) {
      mockServer.use(http.get(`${SNIPPETS_SITE}/analysis/${runtime}.json`, () => HttpResponse.json({ snippets: entries })));
    }

    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis" });

    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(MAX_RESPONSE_BYTES);
    // Truncation lands on codepoint boundaries; no replacement characters.
    expect(result).not.toContain("�");
    expect(result).toContain("…");
    const rows = result.split("\n").filter((line) => line.startsWith("| ") && !line.includes("---") && !line.includes("| Title |"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.split(" | ")).toHaveLength(4);
    }
    expect(result).toContain("get_code_example");
  });

  it("bounds a parallel multi-runtime search by ONE operation deadline", async () => {
    for (const runtime of ["node-legacy", "python-legacy", "node-rt2025", "python-rt2025", "deno-rt2025"]) {
      mockServer.use(
        http.get(`${SNIPPETS_SITE}/analysis/${runtime}.json`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return HttpResponse.json(fixtures.snippetsAnalysisIndex);
        })
      );
    }

    const started = Date.now();
    await expect(runSearchCodeExamples({ query: "console", type: "analysis" }, 100)).rejects.toThrow(/No snippets index could be fetched/);
    // One shared deadline: the whole operation ends near 100 ms, not one
    // cumulative timeout per index.
    expect(Date.now() - started).toBeLessThan(450);
  });

  it("fetches the index only once across two calls (10-minute cache)", async () => {
    let indexFetches = 0;
    mockServer.use(
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025.json`, () => {
        indexFetches += 1;
        return HttpResponse.json(fixtures.snippetsAnalysisIndex);
      })
    );

    await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis", runtime: "node-rt2025" });
    await searchCodeExamplesConfigJSON.tool(context, { query: "create a device", type: "analysis", runtime: "node-rt2025" });

    expect(indexFetches).toBe(1);
  });

  it("refetches the index after the 10-minute TTL expires", async () => {
    let indexFetches = 0;
    mockServer.use(
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025.json`, () => {
        indexFetches += 1;
        return HttpResponse.json(fixtures.snippetsAnalysisIndex);
      })
    );
    const realNow = Date.now();

    await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis", runtime: "node-rt2025" });

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(realNow + 11 * 60 * 1000);
    try {
      const result = await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis", runtime: "node-rt2025" });
      expect(result).toContain("console.js");
    } finally {
      nowSpy.mockRestore();
    }

    expect(indexFetches).toBe(2);
  });

  it("does not cache a failed index fetch", async () => {
    let indexFetches = 0;
    mockServer.use(
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025.json`, () => {
        indexFetches += 1;
        return indexFetches === 1 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(fixtures.snippetsAnalysisIndex);
      })
    );

    await expect(searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis", runtime: "node-rt2025" })).rejects.toThrow(/No snippets index could be fetched/);

    const result = await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis", runtime: "node-rt2025" });
    expect(result).toContain("console.js");
    expect(indexFetches).toBe(2);
  });

  it("sends no Authorization or token header to the snippets host", async () => {
    const seenHeaders: Array<{ authorization: string | null; token: string | null }> = [];
    mockServer.use(
      http.get(`${SNIPPETS_SITE}/analysis/node-rt2025.json`, ({ request }) => {
        seenHeaders.push({ authorization: request.headers.get("authorization"), token: request.headers.get("token") });
        return HttpResponse.json(fixtures.snippetsAnalysisIndex);
      })
    );

    await searchCodeExamplesConfigJSON.tool(context, { query: "console", type: "analysis", runtime: "node-rt2025" });

    expect(seenHeaders).toHaveLength(1);
    expect(seenHeaders[0].authorization).toBeNull();
    expect(seenHeaders[0].token).toBeNull();
  });
});
