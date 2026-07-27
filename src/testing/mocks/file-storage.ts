import { fixtures } from "./fixtures";

/**
 * Stateful mock of the TagoIO Files storage the `/files` handlers serve.
 *
 * It encodes the API's real semantics rather than returning a canned fixture,
 * because both files tools depend on behaviour a canned response would hide:
 *
 * - LIST is an S3 prefix listing with a "/" delimiter, so `path` matches by
 *   prefix (not by folder identity), `filename` comes back as the full
 *   profile-relative path, and folders are bare last segments. No entry ever
 *   carries a URL: signed URLs come from a different route entirely.
 * - DELETE head-checks every path. An exact object key is deleted as a file;
 *   ANY other string is treated as a folder prefix and its whole subtree is
 *   deleted recursively, with no error for a path that matched nothing. That
 *   fallback is the irreversible case `delete_files` exists to prevent, so the
 *   mock reproduces it: a test that lets a bad path through sees real damage.
 */

interface StoredObject {
  filename: string;
  size: number;
  last_modified: string;
  public: boolean;
}

let objects: StoredObject[] = [];
let deleteRequests: string[][] = [];

function resetFileStorage() {
  objects = fixtures.fileStorageObjects.map((object) => ({ ...object }));
  deleteRequests = [];
}

/** Profile-relative keys still stored, sorted the way S3 returns them. */
function storedFilenames(): string[] {
  return objects.map((object) => object.filename).sort();
}

/** Every path array that reached DELETE /files, in call order. */
function recordedDeleteRequests(): string[][] {
  return deleteRequests.map((request) => [...request]);
}

/** The API strips one leading slash from `path` and leaves the rest verbatim. */
function stripLeadingSlash(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

/** Server-side `normalizePath`: strips traversal, trims segments, drops empties. */
function normalizePathLikeServer(raw: string): string {
  return String(raw)
    .replaceAll("../", "/")
    .replaceAll("..", "")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join("/");
}

function listFiles(query: { path: string; qty: number; paginationToken?: string; search: string }) {
  const prefix = stripLeadingSlash(query.path);

  const files: StoredObject[] = [];
  /** Common prefix (the S3 key form) mapped to the last segment the route reports. */
  const folders = new Map<string, string>();
  for (const object of objects) {
    if (!object.filename.startsWith(prefix)) {
      continue;
    }
    const rest = object.filename.slice(prefix.length);
    const separator = rest.indexOf("/");
    if (separator === -1) {
      files.push(object);
      continue;
    }
    // S3 returns the whole common prefix; the route reports its last segment,
    // so a prefix that stops mid-name ("reports.csv") yields "reports.csv".
    const commonPrefix = `${prefix}${rest.slice(0, separator)}/`;
    folders.set(commonPrefix, commonPrefix.slice(0, -1).split("/").pop() ?? "");
  }

  files.sort((left, right) => left.filename.localeCompare(right.filename));

  // MaxKeys counts contents and common prefixes together, so page over both.
  const combined: Array<{ key: string; file?: StoredObject; folder?: string }> = [
    ...files.map((file) => ({ key: file.filename, file })),
    ...[...folders].map(([key, folder]) => ({ key, folder })),
  ].sort((left, right) => left.key.localeCompare(right.key));

  const start = query.paginationToken ? Number(query.paginationToken) : 0;
  const page = combined.slice(start, start + query.qty);
  const nextIndex = start + query.qty;

  const result: {
    files: StoredObject[];
    folders: string[];
    pagination_token?: string;
    total: number;
    usage: number;
  } = {
    total: fixtures.fileStorageAllocation.total,
    usage: fixtures.fileStorageAllocation.usage,
    // `search` filters the fetched page only, after pagination, exactly like the API.
    files: page
      .filter((entry) => entry.file)
      .map((entry) => entry.file!)
      .filter((file) => file.filename.includes(query.search)),
    folders: page
      .filter((entry) => entry.folder)
      .map((entry) => entry.folder!)
      .filter((folder) => folder.includes(query.search)),
  };

  if (nextIndex < combined.length) {
    result.pagination_token = String(nextIndex);
  }

  return result;
}

/** Mirrors the route: exact key deletes a file, anything else deletes a subtree. */
function deleteFiles(paths: string[]): string {
  deleteRequests.push([...paths]);

  for (const rawPath of paths) {
    const path = normalizePathLikeServer(rawPath);
    const exact = objects.find((object) => object.filename === path);
    if (exact) {
      objects = objects.filter((object) => object !== exact);
      continue;
    }
    objects = objects.filter((object) => !object.filename.startsWith(`${path}/`));
  }

  return "Successfully Removed";
}

// Seeded on import so suites that never mutate storage need no setup hook.
resetFileStorage();

export { deleteFiles, listFiles, recordedDeleteRequests, resetFileStorage, storedFilenames };
