import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { makeTestContext } from "../../../../testing/context";
import { docsDeviceTokenPage, docsLlmsTxt } from "../../../../testing/mocks/docs-fixtures";
import { DOCS_SITE } from "../../../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { fetchDocsUrl, readBoundedText } from "../../bounded-fetch";
import { resetDocsIndexCache } from "../../docs-index";
import { platformOverviewConfigJSON } from "../platform-overview";
import { readDocConfigJSON, resetDocPageCache } from "../read-doc";
import { searchDocsConfigJSON } from "../search-docs";

const context = makeTestContext();
const DEVICE_TOKEN_PATH = "/docs/tagoio/devices/device-token.md";

beforeAll(() => mockServer.listen(strictListenOptions));
beforeEach(() => {
  resetDocsIndexCache();
  resetDocPageCache();
});
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("search_docs", () => {
  it("returns the device-token entry for query 'device token'", async () => {
    const result = await searchDocsConfigJSON.tool(context, { query: "device token" });

    expect(result).toContain("Device Token");
    expect(result).toContain(DEVICE_TOKEN_PATH);
  });

  it("respects the limit parameter", async () => {
    const result = await searchDocsConfigJSON.tool(context, { query: "device token", limit: 1 });

    expect(result).toContain("Found 1 documentation page(s)");
  });

  it("returns a controlled suggestion when nothing matches", async () => {
    const result = await searchDocsConfigJSON.tool(context, { query: "xyzzy frobnicate" });

    expect(result).toContain("No documentation pages matched");
    expect(result).toContain("platform_overview");
  });

  it("rejects an index over the byte cap even when under the character cap", async () => {
    // 1.1M chars of "é" is under the 2 MB character count but 2.2 MB in UTF-8.
    const body = new TextEncoder().encode("é".repeat(1_100_000));
    mockServer.use(
      http.get(
        `${DOCS_SITE}/llms.txt`,
        () =>
          new HttpResponse(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(body);
                controller.close();
              },
            }),
            { headers: { "content-type": "text/plain" } }
          )
      )
    );

    await expect(searchDocsConfigJSON.tool(context, { query: "device token" })).rejects.toThrow(/size cap/);
  });

  it("rejects an off-origin redirect of the index without fetching the target", async () => {
    let offOriginHit = false;
    mockServer.use(
      http.get(`${DOCS_SITE}/llms.txt`, () => new HttpResponse(null, { status: 302, headers: { location: "https://evil.example.com/llms.txt" } })),
      http.get("https://evil.example.com/llms.txt", () => {
        offOriginHit = true;
        return HttpResponse.text(docsLlmsTxt);
      })
    );

    await expect(searchDocsConfigJSON.tool(context, { query: "device token" })).rejects.toThrow(/blocked/);
    expect(offOriginHit).toBe(false);
  });

  it("follows a same-origin redirect of the index", async () => {
    mockServer.use(
      http.get(`${DOCS_SITE}/llms.txt`, () => new HttpResponse(null, { status: 302, headers: { location: "/llms-moved.txt" } })),
      http.get(`${DOCS_SITE}/llms-moved.txt`, () => HttpResponse.text(docsLlmsTxt))
    );

    const result = await searchDocsConfigJSON.tool(context, { query: "device token" });

    expect(result).toContain(DEVICE_TOKEN_PATH);
  });

  it("fetches the index only once across two calls (15-minute cache)", async () => {
    let indexFetchCount = 0;
    mockServer.use(
      http.get(`${DOCS_SITE}/llms.txt`, () => {
        indexFetchCount += 1;
        return HttpResponse.text(docsLlmsTxt);
      })
    );

    await searchDocsConfigJSON.tool(context, { query: "device token" });
    await searchDocsConfigJSON.tool(context, { query: "payload parser" });

    expect(indexFetchCount).toBe(1);
  });
});

describe("read_doc", () => {
  it("returns the doc body prefixed with a Source line", async () => {
    const result = await readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH });

    expect(result.startsWith(`Source: https://docs.tago.io${DEVICE_TOKEN_PATH}`)).toBe(true);
    expect(result).toContain("# Device Token");
    expect(result).toContain("Finding the Device Token");
  });

  it("accepts a path missing the leading slash", async () => {
    const result = await readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH.slice(1) });

    expect(result).toContain("# Device Token");
  });

  it("rejects a path that is not in the index, steering to search_docs", async () => {
    await expect(readDocConfigJSON.tool(context, { path: "/docs/tagoio/not-a-real-page.md" })).rejects.toThrow(/search_docs/);
  });

  it("rejects an absolute URL input", async () => {
    await expect(readDocConfigJSON.tool(context, { path: `https://docs.tago.io${DEVICE_TOKEN_PATH}` })).rejects.toThrow(/not a full URL/);
  });

  it("rejects non-markdown content such as an HTML 404 page", async () => {
    mockServer.use(
      http.get(`${DOCS_SITE}/docs/tagoio/devices/index.md`, () =>
        HttpResponse.text("<!doctype html><html><body>Not Found</body></html>", { headers: { "content-type": "text/html" } })
      )
    );

    await expect(readDocConfigJSON.tool(context, { path: "/docs/tagoio/devices/index.md" })).rejects.toThrow(/did not return markdown/);
  });

  it("rejects a body larger than 1 MB", async () => {
    mockServer.use(
      http.get(`${DOCS_SITE}/docs/tagoio/devices/index.md`, () => HttpResponse.text(`# Huge\n${"a".repeat(1024 * 1024 + 1)}`, { headers: { "content-type": "text/markdown" } }))
    );

    await expect(readDocConfigJSON.tool(context, { path: "/docs/tagoio/devices/index.md" })).rejects.toThrow(/1 MB limit/);
  });
});

describe("read_doc page cache", () => {
  function countingPageHandler(onFetch: () => Response | undefined = () => undefined) {
    let pageFetches = 0;
    mockServer.use(
      http.get(`${DOCS_SITE}${DEVICE_TOKEN_PATH}`, () => {
        pageFetches += 1;
        return onFetch() ?? HttpResponse.text(docsDeviceTokenPage, { headers: { "content-type": "text/markdown" } });
      })
    );
    return () => pageFetches;
  }

  it("fetches the page only once across two calls (15-minute cache)", async () => {
    const pageFetches = countingPageHandler();

    const first = await readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH });
    const second = await readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH });

    expect(pageFetches()).toBe(1);
    expect(second).toBe(first);
    expect(second).toContain("# Device Token");
  });

  it("refetches the page after the 15-minute TTL expires", async () => {
    const pageFetches = countingPageHandler();
    const realNow = Date.now();

    await readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH });

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(realNow + 16 * 60 * 1000);
    try {
      const result = await readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH });
      expect(result).toContain("# Device Token");
    } finally {
      nowSpy.mockRestore();
    }

    expect(pageFetches()).toBe(2);
  });

  it("does not cache a failed page fetch", async () => {
    let calls = 0;
    const pageFetches = countingPageHandler(() => {
      calls += 1;
      return calls === 1 ? new HttpResponse(null, { status: 500 }) : undefined;
    });

    await expect(readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH })).rejects.toThrow(/HTTP 500/);

    const result = await readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH });
    expect(result).toContain("# Device Token");
    expect(pageFetches()).toBe(2);
  });
});

describe("read_doc streaming bounds", () => {
  const INDEXED_PATH = "/docs/tagoio/devices/index.md";

  it("cancels a chunked body without Content-Length once it crosses the 1 MB cap", async () => {
    const chunk = new TextEncoder().encode(`# Big\n${"a".repeat(255 * 1024)}`);
    const totalChunks = 40; // ~10 MB if fully consumed
    let pulls = 0;
    mockServer.use(
      http.get(
        `${DOCS_SITE}${INDEXED_PATH}`,
        () =>
          new HttpResponse(
            new ReadableStream<Uint8Array>({
              pull(controller) {
                pulls += 1;
                if (pulls >= totalChunks) {
                  controller.close();
                } else {
                  controller.enqueue(chunk);
                }
              },
            }),
            { headers: { "content-type": "text/markdown" } }
          )
      )
    );

    await expect(readDocConfigJSON.tool(context, { path: INDEXED_PATH })).rejects.toThrow(/1 MB limit/);
    expect(pulls).toBeLessThan(totalChunks);
  });

  it("rejects an oversized Content-Length before consuming the body", async () => {
    // Tiny chunks: reading up to the 1 MB cap would need ~1000 pulls, while
    // rejecting on the header leaves only the transport's readahead (~3).
    const chunk = new TextEncoder().encode("a".repeat(1024));
    let pulls = 0;
    mockServer.use(
      http.get(
        `${DOCS_SITE}${INDEXED_PATH}`,
        () =>
          new HttpResponse(
            new ReadableStream<Uint8Array>({
              pull(controller) {
                pulls += 1;
                if (pulls >= 2000) {
                  controller.close();
                } else {
                  controller.enqueue(chunk);
                }
              },
            }),
            { headers: { "content-type": "text/markdown", "content-length": String(10 * 1024 * 1024) } }
          )
      )
    );

    await expect(readDocConfigJSON.tool(context, { path: INDEXED_PATH })).rejects.toThrow(/1 MB limit/);
    expect(pulls).toBeLessThan(10);
  });

  it("counts multibyte UTF-8 by bytes, not JS characters", async () => {
    // 600k chars of "é" is under the 1 MB character count but 1.2 MB in UTF-8.
    const body = new TextEncoder().encode(`# Ééé\n${"é".repeat(600_000)}`);
    mockServer.use(
      http.get(
        `${DOCS_SITE}${INDEXED_PATH}`,
        () =>
          new HttpResponse(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(body);
                controller.close();
              },
            }),
            { headers: { "content-type": "text/markdown" } }
          )
      )
    );

    await expect(readDocConfigJSON.tool(context, { path: INDEXED_PATH })).rejects.toThrow(/1 MB limit/);
  });

  it("aborts a stalled body when the timeout signal fires", async () => {
    mockServer.use(
      http.get(
        `${DOCS_SITE}/docs/slow.md`,
        () =>
          new HttpResponse(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("# Doc\n"));
                // Never closes: the body stalls after the first chunk.
              },
            }),
            { headers: { "content-type": "text/markdown" } }
          )
      )
    );

    const { response, signal } = await fetchDocsUrl(`${DOCS_SITE}/docs/slow.md`, 200);

    await expect(readBoundedText(response, 1024 * 1024, { signal })).rejects.toThrow(/timeout|timed out|abort/i);
  });
});

describe("read_doc redirect handling", () => {
  const MOVED_PATH = "/docs/tagoio/devices/device-token-moved.md";

  it("follows a same-origin relative redirect", async () => {
    mockServer.use(
      http.get(`${DOCS_SITE}${DEVICE_TOKEN_PATH}`, () => new HttpResponse(null, { status: 302, headers: { location: MOVED_PATH } })),
      http.get(`${DOCS_SITE}${MOVED_PATH}`, () => HttpResponse.text(docsDeviceTokenPage, { headers: { "content-type": "text/markdown" } }))
    );

    const result = await readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH });

    expect(result).toContain("# Device Token");
  });

  it("follows up to three same-origin hops", async () => {
    mockServer.use(
      http.get(`${DOCS_SITE}${DEVICE_TOKEN_PATH}`, () => new HttpResponse(null, { status: 301, headers: { location: "/hop-one.md" } })),
      http.get(`${DOCS_SITE}/hop-one.md`, () => new HttpResponse(null, { status: 302, headers: { location: "/hop-two.md" } })),
      http.get(`${DOCS_SITE}/hop-two.md`, () => new HttpResponse(null, { status: 308, headers: { location: MOVED_PATH } })),
      http.get(`${DOCS_SITE}${MOVED_PATH}`, () => HttpResponse.text(docsDeviceTokenPage, { headers: { "content-type": "text/markdown" } }))
    );

    const result = await readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH });

    expect(result).toContain("# Device Token");
  });

  it("rejects an off-origin redirect without fetching the target", async () => {
    let offOriginHit = false;
    mockServer.use(
      http.get(`${DOCS_SITE}${DEVICE_TOKEN_PATH}`, () => new HttpResponse(null, { status: 302, headers: { location: "https://evil.example.com/doc.md" } })),
      http.get("https://evil.example.com/doc.md", () => {
        offOriginHit = true;
        return HttpResponse.text("# Evil", { headers: { "content-type": "text/markdown" } });
      })
    );

    await expect(readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH })).rejects.toThrow(/blocked/);
    expect(offOriginHit).toBe(false);
  });

  it("rejects an http:// redirect without fetching the target", async () => {
    let insecureHit = false;
    mockServer.use(
      http.get(`${DOCS_SITE}${DEVICE_TOKEN_PATH}`, () => new HttpResponse(null, { status: 302, headers: { location: `http://docs.tago.io${MOVED_PATH}` } })),
      http.get(`http://docs.tago.io${MOVED_PATH}`, () => {
        insecureHit = true;
        return HttpResponse.text(docsDeviceTokenPage, { headers: { "content-type": "text/markdown" } });
      })
    );

    await expect(readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH })).rejects.toThrow(/blocked/);
    expect(insecureHit).toBe(false);
  });

  it("stops a redirect loop after a bounded number of hops", async () => {
    let fetches = 0;
    mockServer.use(
      http.get(`${DOCS_SITE}${DEVICE_TOKEN_PATH}`, () => {
        fetches += 1;
        return new HttpResponse(null, { status: 302, headers: { location: "/loop.md" } });
      }),
      http.get(`${DOCS_SITE}/loop.md`, () => {
        fetches += 1;
        return new HttpResponse(null, { status: 302, headers: { location: DEVICE_TOKEN_PATH } });
      })
    );

    await expect(readDocConfigJSON.tool(context, { path: DEVICE_TOKEN_PATH })).rejects.toThrow(/redirect/);
    expect(fetches).toBeLessThanOrEqual(5);
  });
});

describe("platform_overview", () => {
  it("returns the static overview with all five decision traps", async () => {
    const result = await platformOverviewConfigJSON.tool(context, {});

    expect(result).toContain("# TagoIO Platform Overview");
    expect(result).toContain("### 1. Storage type cannot be changed after creation");
    expect(result).toContain("### 2. Payload parser vs Analysis");
    expect(result).toContain("### 3. Blueprint dashboards depend on naming discipline");
    expect(result).toContain("### 4. Token hierarchy and regions");
    expect(result).toContain("### 5. Device vs Entity");
  });

  it("teaches the exact credential-specific device-data routes and Access Management grant", async () => {
    const result = await platformOverviewConfigJSON.tool(context, {});

    expect(result).toContain("a **device token** calls `GET /data`");
    expect(result).toContain("implicitly bound to the one device the token authenticates");
    expect(result).toContain("a **profile or analysis token** calls `GET /device/:device_id/data`");
    expect(result).toContain("There is no `GET /data/:device_id` route");
    expect(result).toContain("**Access Management** policies with `get_data` permission matching the requested device's ID or tags");
    expect(result).toContain('not by "the device that owns the Analysis"');
  });
});
