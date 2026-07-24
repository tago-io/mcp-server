import { Resources } from "@tago-io/sdk";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { recordedDeleteRequests, resetFileStorage, storedFilenames } from "../../../../testing/mocks/file-storage";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { deleteFilesConfigJSON } from "../delete-files";

const PROFILE_TOKEN = "p-0000000000000000000000000000000000";
const WIDGET_ID = fixtures.IDS.widgetCustom;
const SOURCE_PATH = `widgets/${WIDGET_ID}.tsx`;
const ARTIFACT_PATH = `widgets/.bundled/${WIDGET_ID}/abc123def456.html`;
/** A real FOLDER whose name looks like a file: only a listing can tell them apart. */
const FOLDER_NAMED_LIKE_A_FILE = "reports.csv";

function trackAllRequests() {
  const requests: string[] = [];
  mockServer.events.on("request:start", ({ request }) => {
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  return requests;
}

/**
 * Parses through the tool's own schema before calling the handler, the way the
 * MCP SDK does, so schema-level bounds and handler-level path validation are
 * both exercised on the real path.
 */
async function deletePaths(paths: unknown) {
  const resources = new Resources({ token: PROFILE_TOKEN, region: TEST_REGION });
  const context = makeTestContext({ resources, token: PROFILE_TOKEN, credentialKind: "profile" });
  const parsed = z.object(deleteFilesConfigJSON.parameters).parse({ paths });
  return deleteFilesConfigJSON.tool(context, parsed as never);
}

beforeAll(() => mockServer.listen(strictListenOptions));
beforeEach(() => resetFileStorage());
afterEach(() => {
  mockServer.resetHandlers();
  mockServer.events.removeAllListeners();
});
afterAll(() => mockServer.close());

describe("delete_files deletes exactly the files it was given", () => {
  it("deletes a verified file and reports the path and the freed size", async () => {
    const result = await deletePaths([SOURCE_PATH]);

    expect(recordedDeleteRequests()).toEqual([[SOURCE_PATH]]);
    expect(storedFilenames()).not.toContain(SOURCE_PATH);
    expect(result).toContain(SOURCE_PATH);
    expect(result).toContain("1 file");
  });

  it("deletes a whole orphaned widget in one capped batch", async () => {
    const result = await deletePaths([SOURCE_PATH, ARTIFACT_PATH]);

    expect(recordedDeleteRequests()).toEqual([[SOURCE_PATH, ARTIFACT_PATH]]);
    expect(storedFilenames()).toEqual([`widgets/.bundled/${WIDGET_ID}/old987654321.html`, "reports.csv/january.csv", "uploads/nested/deep.txt", "uploads/report.csv"].sort());
    expect(result).toContain("2 files");
  });

  it("accepts a leading slash and sends the path the API resolves", async () => {
    await deletePaths([`/${SOURCE_PATH}`]);

    expect(recordedDeleteRequests()).toEqual([[SOURCE_PATH]]);
  });
});

describe("delete_files refuses anything that is not a verified file", () => {
  it("refuses a folder, so its subtree is never recursive-deleted", async () => {
    const bundledFolder = `widgets/.bundled/${WIDGET_ID}`;

    await expect(deletePaths([bundledFolder])).rejects.toThrow(/folder/i);

    expect(recordedDeleteRequests()).toEqual([]);
    expect(storedFilenames()).toContain(ARTIFACT_PATH);
  });

  it("refuses a folder whose name looks like a file, which syntax cannot catch", async () => {
    await expect(deletePaths([FOLDER_NAMED_LIKE_A_FILE])).rejects.toThrow(/folder/i);

    expect(recordedDeleteRequests()).toEqual([]);
    expect(storedFilenames()).toContain("reports.csv/january.csv");
  });

  it("refuses a path that matches nothing instead of letting it become a prefix delete", async () => {
    // One mistyped character on a real file is the catastrophic case: the API
    // would treat `widgets/{id}` as a folder and erase everything under it.
    await expect(deletePaths([`widgets/${WIDGET_ID}`])).rejects.toThrow(/not found|no file/i);

    expect(recordedDeleteRequests()).toEqual([]);
    expect(storedFilenames()).toContain(SOURCE_PATH);
  });

  it("refuses the whole batch when any single path fails verification", async () => {
    await expect(deletePaths([SOURCE_PATH, FOLDER_NAMED_LIKE_A_FILE])).rejects.toThrow();

    expect(recordedDeleteRequests()).toEqual([]);
    // The valid path in the same call is untouched: deletion is all or nothing.
    expect(storedFilenames()).toContain(SOURCE_PATH);
  });
});

describe("delete_files rejects malformed paths before any request", () => {
  const rejectedBeforeAnyRequest: Array<[string, string]> = [
    ["traversal", "../../../users/other/storage/secret.txt"],
    ["traversal mid-path", "widgets/../../other/file.tsx"],
    ["glob", "widgets/*.tsx"],
    ["single-character wildcard", "widgets/file?.tsx"],
    ["trailing slash folder form", "widgets/"],
    ["bare root", "/"],
    ["empty string", ""],
    ["whitespace only", "   "],
    ["empty segment", "widgets//file.tsx"],
    ["untrimmed segment", "widgets/ file.tsx "],
    ["newline", "widgets/file.tsx\nwidgets/other.tsx"],
  ];

  for (const [label, path] of rejectedBeforeAnyRequest) {
    it(`rejects ${label} with no outbound traffic at all`, async () => {
      const requests = trackAllRequests();

      await expect(deletePaths([path])).rejects.toThrow(/Invalid `paths`/);

      // Not even the verification listing runs: bad input never reaches the API.
      expect(requests).toEqual([]);
      expect(recordedDeleteRequests()).toEqual([]);
    });
  }

  it("rejects duplicate paths so the confirmation cannot overstate what it deleted", async () => {
    const requests = trackAllRequests();

    await expect(deletePaths([SOURCE_PATH, `/${SOURCE_PATH}`])).rejects.toThrow(/Invalid `paths`/);

    expect(requests).toEqual([]);
  });

  it("caps the batch", async () => {
    const requests = trackAllRequests();
    const tooMany = Array.from({ length: 21 }, (_, index) => `uploads/file-${index}.txt`);

    await expect(deletePaths(tooMany)).rejects.toThrow();

    expect(requests).toEqual([]);
  });

  it("rejects an empty batch", async () => {
    await expect(deletePaths([])).rejects.toThrow();

    expect(recordedDeleteRequests()).toEqual([]);
  });
});
