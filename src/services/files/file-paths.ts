import { invalidParamError } from "../../utils/tool-errors";

/**
 * Path handling for the Files tools.
 *
 * Files paths are profile-relative: the API prefixes every key with the
 * requesting token's own profile server-side, so no path can reach another
 * profile and no host or profile matching is needed here. What the API does
 * NOT do is tell a file from a folder. Its delete route head-checks each key
 * and treats anything that is not an exact object as a folder prefix, erasing
 * the whole subtree without an error, so a single mistyped character on a real
 * file silently destroys a directory.
 *
 * These checks therefore reject only what is malformed or ambiguous. Proving a
 * path is a file is a listing's job (see `delete-files.ts`); syntax cannot do
 * it, because a folder may legitimately be named `reports.csv`.
 */

const MAX_PATH_LENGTH = 900;
/** Glob and shell-wildcard characters: never valid in a key, always a sign the caller meant a set. */
const WILDCARD_PATTERN = /[*?[\]{}]/;
const PATH_EXAMPLE = "widgets/61f0000000000000000db004.tsx";

/** Control characters (including newlines) never belong in a key and can smuggle line breaks into rendered output. */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Normalizes a caller-supplied path to the key the API will resolve, or throws
 * an actionable error. Only a single leading slash is absorbed (the list route
 * strips exactly one); everything else must already be canonical, so the value
 * validated here is byte-identical to the value sent and to the value echoed
 * back in the confirmation.
 */
function normalizeFilePath(raw: string): string {
  const constraint = (detail: string) => invalidParamError("paths", detail, PATH_EXAMPLE);

  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw constraint("each path must be a non-empty file path");
  }
  if (hasControlCharacter(raw)) {
    throw constraint("a path contains a control character");
  }
  if (raw.length > MAX_PATH_LENGTH) {
    throw constraint(`each path must be at most ${MAX_PATH_LENGTH} characters`);
  }
  if (WILDCARD_PATTERN.test(raw)) {
    throw constraint(`"${raw}" looks like a pattern; wildcards are not expanded, pass each file path explicitly`);
  }

  const path = raw.startsWith("/") ? raw.slice(1) : raw;

  if (path.endsWith("/")) {
    throw constraint(`"${raw}" is a folder path; only file paths can be deleted`);
  }

  // Rejected ANYWHERE, not just as a whole segment. The delete route strips
  // every ".." before resolving a key, so a path like `archive..bak/report.csv`
  // would be verified as itself and then deleted as `archivebak/report.csv`,
  // which is a different key and, when absent, a recursive prefix delete.
  if (path.includes("..")) {
    throw constraint(`"${raw}" contains "..", which the API strips before resolving the file, so it cannot be deleted by this exact path`);
  }

  const segments = path.split("/");
  for (const segment of segments) {
    if (segment.length === 0) {
      throw constraint(`"${raw}" has an empty path segment`);
    }
    if (segment === ".") {
      throw constraint(`"${raw}" contains a relative segment`);
    }
    // The API trims every segment, so an untrimmed one resolves to a DIFFERENT
    // key than the one verified here. Rejecting keeps checked and sent identical.
    if (segment !== segment.trim()) {
      throw constraint(`"${raw}" has leading or trailing whitespace in a path segment`);
    }
  }

  return path;
}

/** Splits a profile-relative key into its parent folder path and file name. */
function splitFilePath(path: string): { parent: string; name: string } {
  const separator = path.lastIndexOf("/");
  if (separator === -1) {
    return { parent: "", name: path };
  }
  return { parent: path.slice(0, separator + 1), name: path.slice(separator + 1) };
}

export { MAX_PATH_LENGTH, normalizeFilePath, splitFilePath };
