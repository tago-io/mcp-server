import { Resources } from "@tago-io/sdk";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { resetFileStorage } from "../../../../testing/mocks/file-storage";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { searchFilesConfigJSON } from "../search-files";

const PROFILE_TOKEN = "p-0000000000000000000000000000000000";
const WIDGET_ID = fixtures.IDS.widgetCustom;

/** Records EVERY outbound SDK request so we can assert which routes were touched. */
function trackAllRequests() {
  const requests: string[] = [];
  mockServer.events.on("request:start", ({ request }) => {
    requests.push(`${request.method} ${new URL(request.url).pathname}${new URL(request.url).search}`);
  });
  return requests;
}

function search(params: Record<string, unknown>) {
  const resources = new Resources({ token: PROFILE_TOKEN, region: TEST_REGION });
  const context = makeTestContext({ resources, token: PROFILE_TOKEN, credentialKind: "profile" });
  return searchFilesConfigJSON.tool(context, params as never);
}

beforeAll(() => mockServer.listen(strictListenOptions));
beforeEach(() => resetFileStorage());
afterEach(() => {
  mockServer.resetHandlers();
  mockServer.events.removeAllListeners();
});
afterAll(() => mockServer.close());

describe("search_files listing contract", () => {
  it("lists one level: root shows folders, not the files nested inside them", async () => {
    const result = await search({});

    expect(result).toContain("uploads");
    expect(result).toContain("widgets");
    // Nested keys stay collapsed into their folder, exactly like the delimiter listing.
    expect(result).not.toContain("uploads/report.csv");
    expect(result).not.toContain(`widgets/${WIDGET_ID}.tsx`);
  });

  it("renders filenames as full profile-relative paths inside a folder", async () => {
    const result = await search({ path: "widgets/" });

    // The API returns the whole key minus the profile prefix, not a basename.
    expect(result).toContain(`widgets/${WIDGET_ID}.tsx`);
    expect(result).toContain(".bundled");
  });

  it("reaches the bundled-artifact folder that orphans after a widget delete", async () => {
    const result = await search({ path: `widgets/.bundled/${WIDGET_ID}/` });

    expect(result).toContain(`widgets/.bundled/${WIDGET_ID}/abc123def456.html`);
    expect(result).toContain(`widgets/.bundled/${WIDGET_ID}/old987654321.html`);
  });

  it("reports storage usage so orphaned files can be weighed", async () => {
    const result = await search({});

    expect(result).toContain("5.25");
    expect(result).toContain("200");
  });

  it("passes amount through as the API's qty and paginates by cursor, not page", async () => {
    const requests = trackAllRequests();

    const firstPage = await search({ path: "widgets/.bundled/" + WIDGET_ID + "/", amount: 1 });

    expect(requests[0]).toMatch(/qty=1(&|$)/);
    // A full page hands back the cursor the next call must echo.
    expect(firstPage).toContain("pagination_token");

    const secondPage = await search({ path: `widgets/.bundled/${WIDGET_ID}/`, amount: 1, pagination_token: "1" });

    expect(requests[1]).toContain("pagination_token=1");
    expect(secondPage).toContain("old987654321.html");
    expect(secondPage).not.toContain("abc123def456.html");
  });

  it("never resolves a signed URL: exactly one GET /files and no file route", async () => {
    const requests = trackAllRequests();

    const result = await search({ path: "widgets/" });

    expect(requests).toEqual(["GET /files?path=widgets%2F&qty=100"]);
    // getFileURLSigned is never called, so no credential can reach the output.
    expect(result).not.toContain("X-Amz-Signature");
    expect(result).not.toContain("storage.tago.example");
    expect(result).not.toMatch(/https?:\/\//);
  });

  it("steers to the file locations that orphan when the profile has none", async () => {
    const result = await search({ path: "nothing-here/" });

    expect(result).toContain("No files or folders");
    expect(result).toContain("widgets/");
  });
});
