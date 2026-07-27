import { LookupAddress } from "node:dns";
import { EventEmitter } from "node:events";
import https from "node:https";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { HttpResponse, delay, http, passthrough } from "msw";
import fc from "fast-check";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { MAX_RAW_BYTES, MAX_SOURCE_BYTES, assertPublicAddress, fetchAnalysisSource, isControlledFetchError, makeValidatingLookup } from "../../source-fetch";

const STORAGE = "https://storage.tago.example";
const SIGNED_URL = `${STORAGE}/scripts/abc?X-Sig=fake-signature-sentinel`;

function fakeDns(addresses: LookupAddress[]) {
  const calls: string[] = [];
  const lookup = (hostname: string, _options: { all: true }, callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => {
    calls.push(hostname);
    callback(null, addresses);
  };
  return { lookup, calls };
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("assertPublicAddress", () => {
  const rejected = [
    // IPv4 loopback / private / link-local / CGNAT / this-network
    "127.0.0.1",
    "127.255.255.255",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.168.255.255",
    "169.254.169.254",
    "169.254.0.1",
    "100.64.0.1",
    "100.127.255.255",
    "0.0.0.0",
    "0.1.2.3",
    // IPv4 benchmarking / multicast / reserved / broadcast
    "198.18.0.1",
    "198.19.255.255",
    "224.0.0.1",
    "239.255.255.255",
    "240.0.0.1",
    "255.255.255.255",
    // IANA special-purpose: IETF protocol assignments, TEST-NETs, 6to4 relay
    "192.0.0.1",
    "192.0.0.9",
    "192.0.0.10",
    "192.0.0.170",
    "192.0.0.255",
    "192.0.2.1",
    "192.0.2.255",
    "192.88.99.1",
    "198.51.100.1",
    "198.51.100.255",
    "203.0.113.1",
    "203.0.113.10",
    "203.0.113.255",
    // IPv4-mapped and NAT64 literals are rejected outright, even when the
    // embedded IPv4 is itself public; the classifier never follows the
    // embedding to the embedded address.
    "::ffff:192.0.2.1",
    "::ffff:203.0.113.10",
    "64:ff9b::198.51.100.7",
    "::ffff:8.8.8.8",
    "64:ff9b::8.8.8.8",
    // IPv6 loopback / unspecified / link-local / ULA / multicast
    "::1",
    "::",
    "fe80::1",
    "febf::1",
    "fc00::1",
    "fd12:3456:789a::1",
    "ff02::1",
    // IPv6 mapped/compatible/NAT64 embedding non-public IPv4
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:192.168.1.1",
    "::ffff:169.254.169.254",
    "::0.0.0.1",
    "::8.8.8.8",
    "64:ff9b::10.0.0.1",
    "64:ff9b::7f00:1",
    // IPv6 documentation
    "2001:db8::1",
    "2001:db8:ffff::1",
    "3fff::1",
    "3fff:fff:ffff::1",
    // IPv6 special-purpose: 2001::/23 (Teredo/benchmark/ORCHID/AMT), 6to4,
    // SRv6 SIDs, discard-only, local-use NAT64
    "2001::1",
    "2001:0:4136:e378:8000:63bf:a00:1",
    "2001:2::1",
    "2001:10::1",
    "2001:20::1",
    "2001:1ff:ffff::1",
    "2002::1",
    "2002:7f00:1::1",
    "2002:c0a8:101::1",
    "5f00::1",
    "5f00:ffff::1",
    "100::1",
    "100::ffff:ffff:ffff:ffff",
    "64:ff9b:1::a",
    // Everything outside global-unicast 2000::/3 is rejected fail-closed:
    // reserved outer blocks, deprecated site-local, and 100::/56 subnets
    // beyond the discard-only /64.
    "100:0:0:1::1",
    "100:0:0:ffff::1",
    "1fff:ffff:ffff:ffff::1",
    "4000::1",
    "5f01::1",
    "6000::1",
    "8000::1",
    "a000::1",
    "c000::1",
    "e000::1",
    "fec0::1",
    "feff::1",
    // unparseable input fails closed
    "not-an-ip",
    "1.2.3",
    "1.2.3.4.5",
    "fe80::1%en0",
    "12345::1",
  ];

  it.each(rejected)("rejects %s", (address) => {
    expect(() => assertPublicAddress(address)).toThrow(/address/);
  });

  const accepted = [
    // Genuinely globally reachable addresses (public DNS, example.com) and
    // the direct neighbors of every blocked range boundary.
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.15.255.255",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "198.17.255.255",
    "198.20.0.1",
    "223.255.255.255",
    "192.0.1.1",
    "192.0.3.1",
    "192.88.98.255",
    "192.88.100.0",
    "192.169.0.0",
    "198.51.99.255",
    "198.51.101.0",
    "203.0.112.255",
    "203.0.114.0",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "2600::1",
    // Direct neighbors of the blocked IPv6 special-purpose ranges, plus the
    // boundaries of global-unicast 2000::/3 itself
    "2001:200::1",
    "2003::1",
    "3fff:1000::1",
    "2000::1",
    "3ffe::1",
    "3fff:ffff:ffff::1",
  ];

  it.each(accepted)("accepts %s", (address) => {
    expect(() => assertPublicAddress(address)).not.toThrow();
  });
});

describe("assertPublicAddress properties", () => {
  /** Runs the gate and returns the outcome, failing the test on any uncontrolled throw. */
  function outcome(address: string): "accepted" | "rejected" {
    try {
      assertPublicAddress(address);
      return "accepted";
    } catch (error) {
      if (!isControlledFetchError(error)) {
        throw error;
      }
      expect((error as Error).message).toMatch(/address/);
      return "rejected";
    }
  }

  it("never throws uncontrolled for arbitrary IPv4/IPv6 literals", () => {
    fc.assert(
      fc.property(fc.oneof(fc.ipV4(), fc.ipV6()), (address) => {
        outcome(address);
      }),
      { numRuns: 2000 }
    );
  });

  it("rejects every address drawn from known non-public ranges", () => {
    const octet = fc.integer({ min: 0, max: 255 });
    const group = () => fc.integer({ min: 0, max: 0xffff }).map((value) => value.toString(16));
    const nonPublic = fc.oneof(
      // IPv4 private / loopback / link-local / CGNAT / this-network / benchmarking / multicast / reserved
      fc.tuple(octet, octet).map(([c, d]) => `10.0.${c}.${d}`),
      fc.tuple(octet, octet).map(([c, d]) => `192.168.${c}.${d}`),
      fc.tuple(fc.integer({ min: 16, max: 31 }), octet, octet).map(([b, c, d]) => `172.${b}.${c}.${d}`),
      fc.tuple(octet, octet).map(([c, d]) => `127.0.${c}.${d}`),
      octet.map((d) => `169.254.169.${d}`),
      fc.tuple(fc.integer({ min: 64, max: 127 }), octet, octet).map(([b, c, d]) => `100.${b}.${c}.${d}`),
      octet.map((d) => `0.0.0.${d}`),
      octet.map((d) => `224.0.0.${d}`),
      octet.map((d) => `240.0.0.${d}`),
      // IPv6 unique-local / link-local / multicast / loopback / documentation / mapped / NAT64
      fc.tuple(group(), group()).map(([a, b]) => `fd12:${a}:${b}::1`),
      group().map((a) => `fe80::${a}`),
      group().map((a) => `ff02::${a}`),
      fc.constant("::1"),
      fc.tuple(group(), group()).map(([a, b]) => `2001:db8:${a}:${b}::1`),
      fc.tuple(octet, octet).map(([c, d]) => `::ffff:10.0.${c}.${d}`),
      fc.tuple(octet, octet).map(([c, d]) => `64:ff9b::10.0.${c}.${d}`)
    );
    fc.assert(
      fc.property(nonPublic, (address) => {
        expect(outcome(address)).toBe("rejected");
      }),
      { numRuns: 2000 }
    );
  });
});

describe("validating lookup", () => {
  it("rejects when ANY resolved address is non-public", async () => {
    const { lookup } = fakeDns([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    const validating = makeValidatingLookup(lookup);

    const error = await new Promise<Error | null>((resolve) => validating("mixed.example", {}, (err) => resolve(err)));
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toMatch(/address/);
  });

  it("passes through a public-only result set in both callback shapes", async () => {
    const addresses: LookupAddress[] = [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ];
    const validating = makeValidatingLookup(fakeDns(addresses).lookup);

    const single = await new Promise<{ address?: unknown; family?: unknown }>((resolve) =>
      validating("public.example", {}, (err, address, family) => resolve(err ? {} : { address, family }))
    );
    expect(single).toEqual({ address: "93.184.216.34", family: 4 });

    const all = await new Promise<unknown>((resolve) => validating("public.example", { all: true }, (err, resolved) => resolve(err ? undefined : resolved)));
    expect(all).toEqual(addresses);
  });

  it("propagates dns errors and rejects empty result sets", async () => {
    const failing = makeValidatingLookup((_hostname, _options, callback) => callback(new Error("dns down") as NodeJS.ErrnoException, []));
    const dnsError = await new Promise<Error | null>((resolve) => failing("down.example", {}, (err) => resolve(err)));
    expect(dnsError?.message).toBe("dns down");

    const empty = makeValidatingLookup(fakeDns([]).lookup);
    const emptyError = await new Promise<Error | null>((resolve) => empty("empty.example", {}, (err) => resolve(err)));
    expect(emptyError?.message).toMatch(/no addresses/);
  });
});

describe("URL rules (no I/O)", () => {
  const neverResolve = () => {
    throw new Error("lookup must not be called");
  };
  const lookupSpy = vi.fn(neverResolve);

  it.each([
    ["http scheme", "http://storage.tago.example/scripts/abc"],
    ["ftp scheme", "ftp://storage.tago.example/scripts/abc"],
    ["userinfo", "https://user:secret@storage.tago.example/scripts/abc"],
    ["invalid URL", "not a url"],
  ])("rejects %s before any request", async (_label, url) => {
    await expect(fetchAnalysisSource(url, { lookup: lookupSpy as never })).rejects.toThrow(/https|credentials|valid URL/);
    expect(lookupSpy).not.toHaveBeenCalled();
  });
});

describe("bounded fetch behavior", () => {
  const script = 'console.log("bounded fetch source");\n';

  it("fetches a raw source body", async () => {
    const result = await fetchAnalysisSource(SIGNED_URL);
    expect(result.source).toContain("fixture analysis script");
    expect(result.wasGzip).toBe(false);
    expect(result.rawBytes).toBeGreaterThan(0);
  });

  it("decompresses a gzip artifact exactly once", async () => {
    const gzipped = gzipSync(Buffer.from(script, "utf8"));
    mockServer.use(http.get(`${STORAGE}/gzip`, () => new HttpResponse(new Uint8Array(gzipped))));

    const result = await fetchAnalysisSource(`${STORAGE}/gzip`);
    expect(result.source).toBe(script);
    expect(result.wasGzip).toBe(true);
    expect(result.rawBytes).toBe(gzipped.byteLength);
  });

  it("does not run a second decompression pass on a double-gzipped body", async () => {
    const doubled = gzipSync(gzipSync(Buffer.from(script, "utf8")));
    mockServer.use(http.get(`${STORAGE}/double-gzip`, () => new HttpResponse(new Uint8Array(doubled))));

    // One pass leaves gzip bytes, which cannot decode as UTF-8.
    await expect(fetchAnalysisSource(`${STORAGE}/double-gzip`)).rejects.toThrow(/UTF-8/);
  });

  it("rejects any Content-Encoding other than identity", async () => {
    mockServer.use(http.get(`${STORAGE}/encoded`, () => new HttpResponse(new Uint8Array(gzipSync(Buffer.from(script))), { headers: { "content-encoding": "gzip" } })));
    await expect(fetchAnalysisSource(`${STORAGE}/encoded`)).rejects.toThrow(/transport encoding/);
  });

  it("aborts a chunked raw body past the 2 MiB cap", async () => {
    const chunk = new Uint8Array(512 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 5; index += 1) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
    mockServer.use(http.get(`${STORAGE}/huge`, () => new HttpResponse(stream)));

    await expect(fetchAnalysisSource(`${STORAGE}/huge`)).rejects.toThrow(new RegExp(`${MAX_RAW_BYTES} byte`));
  });

  it("rejects a Content-Length over the raw cap before reading the body", async () => {
    mockServer.use(http.get(`${STORAGE}/declared-huge`, () => new HttpResponse("x", { headers: { "content-length": String(MAX_RAW_BYTES + 1) } })));
    await expect(fetchAnalysisSource(`${STORAGE}/declared-huge`)).rejects.toThrow(new RegExp(`${MAX_RAW_BYTES} byte`));
  });

  it("aborts a decompression bomb at the 1 MiB output cap", async () => {
    const bomb = gzipSync(Buffer.alloc(4 * 1024 * 1024));
    expect(bomb.byteLength).toBeLessThan(64 * 1024);
    mockServer.use(http.get(`${STORAGE}/bomb`, () => new HttpResponse(new Uint8Array(bomb))));

    await expect(fetchAnalysisSource(`${STORAGE}/bomb`)).rejects.toThrow(new RegExp(`${MAX_SOURCE_BYTES} byte`));
  });

  it("rejects a raw non-gzip body over the 1 MiB source cap", async () => {
    mockServer.use(http.get(`${STORAGE}/big-raw`, () => new HttpResponse("a".repeat(MAX_SOURCE_BYTES + 1))));
    await expect(fetchAnalysisSource(`${STORAGE}/big-raw`)).rejects.toThrow(new RegExp(`${MAX_SOURCE_BYTES} byte`));
  });

  it("produces a controlled error for truncated gzip", async () => {
    const truncated = gzipSync(Buffer.from(script.repeat(50), "utf8")).subarray(0, 20);
    mockServer.use(http.get(`${STORAGE}/truncated`, () => new HttpResponse(new Uint8Array(truncated))));
    await expect(fetchAnalysisSource(`${STORAGE}/truncated`)).rejects.toThrow(/corrupt or truncated/);
  });

  it("treats invalid UTF-8 as a fatal controlled error", async () => {
    mockServer.use(http.get(`${STORAGE}/bad-utf8`, () => new HttpResponse(new Uint8Array([0x63, 0xc3, 0x28, 0x64]))));
    await expect(fetchAnalysisSource(`${STORAGE}/bad-utf8`)).rejects.toThrow(/UTF-8/);
  });

  it("reports non-2xx statuses as a status class only", async () => {
    mockServer.use(http.get(`${STORAGE}/server-error`, () => new HttpResponse("boom", { status: 503 })));
    await expect(fetchAnalysisSource(`${STORAGE}/server-error`)).rejects.toThrow(/HTTP 5xx/);
  });

  it("follows at most 3 redirects", async () => {
    mockServer.use(
      http.get(`${STORAGE}/r0`, () => new HttpResponse(null, { status: 302, headers: { location: `${STORAGE}/r1` } })),
      http.get(`${STORAGE}/r1`, () => new HttpResponse(null, { status: 302, headers: { location: `${STORAGE}/r2` } })),
      http.get(`${STORAGE}/r2`, () => new HttpResponse(null, { status: 302, headers: { location: `${STORAGE}/r3` } })),
      http.get(`${STORAGE}/r3`, () => new HttpResponse(null, { status: 302, headers: { location: `${STORAGE}/final` } })),
      http.get(`${STORAGE}/final`, () => HttpResponse.text(script))
    );
    await expect(fetchAnalysisSource(`${STORAGE}/r0`)).rejects.toThrow(/redirect/);
  });

  it("follows an allowed redirect chain within the hop limit", async () => {
    mockServer.use(
      http.get(`${STORAGE}/hop0`, () => new HttpResponse(null, { status: 302, headers: { location: "/hop-final" } })),
      http.get(`${STORAGE}/hop-final`, () => HttpResponse.text(script))
    );
    const result = await fetchAnalysisSource(`${STORAGE}/hop0`);
    expect(result.source).toBe(script);
  });

  it("rejects a redirect that downgrades to http", async () => {
    mockServer.use(http.get(`${STORAGE}/to-http`, () => new HttpResponse(null, { status: 302, headers: { location: "http://storage.tago.example/x" } })));
    await expect(fetchAnalysisSource(`${STORAGE}/to-http`)).rejects.toThrow(/https/);
  });

  it("rejects a redirect to a host resolving to a private address", async () => {
    mockServer.use(
      http.get(`${STORAGE}/to-private`, () => new HttpResponse(null, { status: 302, headers: { location: "https://private-target.example/x" } })),
      // passthrough sends the hop through the real request machinery, so the
      // injected lookup runs and the private resolution is rejected pre-connect.
      http.get("https://private-target.example/x", () => passthrough())
    );
    const { lookup } = fakeDns([{ address: "10.0.0.5", family: 4 }]);
    await expect(fetchAnalysisSource(`${STORAGE}/to-private`, { lookup })).rejects.toThrow(/address/);
  });

  it("rejects a DNS answer outside IPv6 global-unicast space", async () => {
    // passthrough sends the hop through the real request machinery, so the
    // injected lookup runs and the reserved resolution is rejected pre-connect.
    mockServer.use(http.get("https://sitelocal-target.example/x", () => passthrough()));
    const { lookup } = fakeDns([{ address: "fec0::1", family: 6 }]);
    await expect(fetchAnalysisSource("https://sitelocal-target.example/x", { lookup })).rejects.toThrow(/non-public address/);
  });

  it("rejects a redirect to an IPv6 literal outside global-unicast space", async () => {
    mockServer.use(http.get(`${STORAGE}/to-reserved-v6`, () => new HttpResponse(null, { status: 302, headers: { location: "https://[4000::1]/x" } })));
    await expect(fetchAnalysisSource(`${STORAGE}/to-reserved-v6`)).rejects.toThrow(/non-public address/);
  });

  it.each([
    "https://127.0.0.1/scripts/x",
    "https://[::1]/scripts/x",
    "https://169.254.169.254/scripts/x",
    "https://[::ffff:10.0.0.5]/scripts/x",
    "https://[fec0::1]/scripts/x",
    "https://[100:0:0:1::1]/scripts/x",
  ])("rejects the IP-literal URL %s before any I/O (custom lookups never run for IP literals)", async (url) => {
    const { lookup, calls } = fakeDns([{ address: "93.184.216.34", family: 4 }]);
    await expect(fetchAnalysisSource(url, { lookup })).rejects.toThrow(/non-public address/);
    expect(calls.length).toBe(0);
  });

  it("rejects a redirect to an IP-literal private address", async () => {
    mockServer.use(http.get(`${STORAGE}/to-ip-literal`, () => new HttpResponse(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } })));
    await expect(fetchAnalysisSource(`${STORAGE}/to-ip-literal`)).rejects.toThrow(/non-public address/);
  });

  it("enforces one total deadline across the fetch", async () => {
    mockServer.use(
      http.get(`${STORAGE}/slow`, async () => {
        await delay(400);
        return HttpResponse.text(script);
      })
    );
    await expect(fetchAnalysisSource(`${STORAGE}/slow`, { timeoutMs: 50 })).rejects.toThrow(/deadline/);
  });

  it("errors on a redirect without a Location header", async () => {
    mockServer.use(http.get(`${STORAGE}/no-location`, () => new HttpResponse(null, { status: 302 })));
    await expect(fetchAnalysisSource(`${STORAGE}/no-location`)).rejects.toThrow(/Location/);
  });

  it("errors on a redirect with an unparseable Location", async () => {
    mockServer.use(http.get(`${STORAGE}/bad-location`, () => new HttpResponse(null, { status: 302, headers: { location: "https://" } })));
    await expect(fetchAnalysisSource(`${STORAGE}/bad-location`)).rejects.toThrow(/invalid URL/);
  });

  it("never leaks the URL, query sentinel, or host into error messages", async () => {
    mockServer.use(
      http.get(`${STORAGE}/scripts/abc`, () => new HttpResponse("nope", { status: 500 })),
      http.get(`${STORAGE}/leak-redirects`, () => new HttpResponse(null, { status: 302, headers: { location: `${SIGNED_URL}&hop=1` } }))
    );

    const failures = [
      await fetchAnalysisSource(SIGNED_URL).catch((error) => (error as Error).message),
      await fetchAnalysisSource("http://storage.tago.example/scripts/abc?X-Sig=fake-signature-sentinel").catch((error) => (error as Error).message),
    ];
    for (const message of failures) {
      expect(typeof message).toBe("string");
      expect(message).not.toContain("fake-signature-sentinel");
      expect(message).not.toContain("storage.tago.example");
      expect(message).not.toContain("X-Sig");
    }
  });
});

/**
 * Discarded-body lifecycle: redirect and error bodies are never read, so the
 * fetch must destroy them instead of leaving them flowing. MSW pumps mocked
 * bodies independently of client consumption, so these tests replace
 * https.request (the module-object seam source-fetch imports) with a fake
 * that serves real node Readable responses; destroy semantics are then
 * directly observable: a destroyed Readable stops accepting pushes and emits
 * no further data.
 */
describe("discarded body lifecycle", () => {
  const script = 'console.log("lifecycle source");\n';

  interface FakeRoute {
    status: number;
    headers?: Record<string, string>;
    body: "endless" | string;
  }

  interface EndlessState {
    url: string;
    response: Readable & { destroyed: boolean };
    dataAfterSettle: number;
    startSettle: () => void;
  }

  const activeTimers: NodeJS.Timeout[] = [];

  afterEach(() => {
    for (const timer of activeTimers.splice(0)) {
      clearInterval(timer);
    }
    vi.restoreAllMocks();
  });

  function fakeHttps(routes: Record<string, FakeRoute>) {
    const endless: EndlessState[] = [];
    vi.spyOn(https, "request").mockImplementation(((target: URL, _options: unknown, callback: (response: unknown) => void) => {
      const request = new EventEmitter() as EventEmitter & { end: () => void };
      request.end = () => {
        const route = routes[target.pathname];
        if (!route) {
          throw new Error(`no fake route for ${target.pathname}`);
        }
        const response = new Readable({ read() {} }) as Readable & { statusCode: number; headers: Record<string, string> };
        response.statusCode = route.status;
        response.headers = route.headers ?? {};

        if (route.body === "endless") {
          const state: EndlessState = {
            url: target.pathname,
            response,
            dataAfterSettle: 0,
            startSettle: () => {
              response.on("data", () => {
                state.dataAfterSettle += 1;
              });
            },
          };
          endless.push(state);
          const timer = setInterval(() => {
            if (!response.destroyed) {
              response.push(Buffer.alloc(1024));
            }
          }, 2);
          activeTimers.push(timer);
        } else {
          response.push(Buffer.from(route.body, "utf8"));
          response.push(null);
        }
        queueMicrotask(() => callback(response));
      };
      return request;
    }) as never);
    return endless;
  }

  async function assertTornDown(endless: EndlessState[]) {
    expect(endless.length).toBeGreaterThan(0);
    for (const state of endless) {
      expect(state.response.destroyed, `${state.url} response was not destroyed`).toBe(true);
      state.startSettle();
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
    for (const state of endless) {
      expect(state.dataAfterSettle, `${state.url} kept flowing after settlement`).toBe(0);
    }
  }

  it("destroys an endless redirect body while the final target still succeeds", async () => {
    const endless = fakeHttps({
      "/endless-redirect": { status: 302, headers: { location: `${STORAGE}/after-redirect` }, body: "endless" },
      "/after-redirect": { status: 200, body: script },
    });

    const result = await fetchAnalysisSource(`${STORAGE}/endless-redirect`);
    expect(result.source).toBe(script);
    await assertTornDown(endless);
  });

  it("destroys an endless non-2xx body when the status is rejected", async () => {
    const endless = fakeHttps({ "/endless-error": { status: 500, body: "endless" } });
    await expect(fetchAnalysisSource(`${STORAGE}/endless-error`)).rejects.toThrow(/HTTP 5xx/);
    await assertTornDown(endless);
  });

  it("destroys an endless redirect body on the missing-Location exit", async () => {
    const endless = fakeHttps({ "/endless-no-location": { status: 302, body: "endless" } });
    await expect(fetchAnalysisSource(`${STORAGE}/endless-no-location`)).rejects.toThrow(/Location/);
    await assertTornDown(endless);
  });

  it("destroys an endless redirect body on the invalid-Location exit", async () => {
    const endless = fakeHttps({ "/endless-bad-location": { status: 302, headers: { location: "https://" }, body: "endless" } });
    await expect(fetchAnalysisSource(`${STORAGE}/endless-bad-location`)).rejects.toThrow(/invalid URL/);
    await assertTornDown(endless);
  });

  it("destroys every endless redirect body on the hop-limit exit", async () => {
    const endless = fakeHttps({
      "/loop0": { status: 302, headers: { location: `${STORAGE}/loop1` }, body: "endless" },
      "/loop1": { status: 302, headers: { location: `${STORAGE}/loop2` }, body: "endless" },
      "/loop2": { status: 302, headers: { location: `${STORAGE}/loop3` }, body: "endless" },
      "/loop3": { status: 302, headers: { location: `${STORAGE}/never` }, body: "endless" },
    });

    await expect(fetchAnalysisSource(`${STORAGE}/loop0`)).rejects.toThrow(/redirect/);
    expect(endless.length).toBe(4);
    await assertTornDown(endless);
  });

  it("destroys an endless body carrying an unsupported transport encoding", async () => {
    const endless = fakeHttps({ "/endless-encoded": { status: 200, headers: { "content-encoding": "br" }, body: "endless" } });
    await expect(fetchAnalysisSource(`${STORAGE}/endless-encoded`)).rejects.toThrow(/transport encoding/);
    await assertTornDown(endless);
  });
});
