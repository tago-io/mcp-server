import { z } from "zod/v3";

import { invalidParamError } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";
import { normalizeFilePath, splitFilePath } from "../file-paths";
import { listFiles } from "../files-api";

const MAX_PATHS = 20;
/**
 * Verification page size. The listing is a prefix query on the full path, and
 * an exact key always sorts before every other key sharing it as a prefix, so
 * a match can only be on the first page. A small page keeps the check cheap.
 */
const VERIFY_PAGE_SIZE = 10;

const deleteFilesSchema = {
  paths: z
    .array(z.string())
    .min(1)
    .max(MAX_PATHS)
    .describe(
      `File paths to delete, relative to the profile's storage root (max ${MAX_PATHS} per call). Each must be a complete path to a single existing file, as reported by search_files. Folders, prefixes, and wildcard patterns are rejected.`
    ),
};

type DeleteFilesParams = z.infer<z.ZodObject<typeof deleteFilesSchema>>;

interface VerifiedFile {
  path: string;
  size: number;
}

/**
 * Confirms every path is an existing FILE before anything is deleted.
 *
 * This is the tool's safety property, and it cannot be met by validating the
 * path text. The API deletes an exact object key as a file but treats every
 * other string as a folder prefix and erases that subtree recursively, without
 * reporting an error, so a mistyped file name is silently a directory wipe.
 * Nothing in a path distinguishes the two cases (a folder can be named
 * `reports.csv`), so each path is listed and must come back as a file.
 */
async function verifyFiles(context: ServerContext, paths: string[]): Promise<{ verified: VerifiedFile[]; problems: string[] }> {
  const verified: VerifiedFile[] = [];
  const problems: string[] = [];

  for (const path of paths) {
    const listing = await listFiles(context.resources, { path, quantity: VERIFY_PAGE_SIZE });
    const match = (listing.files ?? []).find((file) => file.filename === path);
    if (match) {
      verified.push({ path, size: match.size });
      continue;
    }

    const { name } = splitFilePath(path);
    if ((listing.folders ?? []).includes(name)) {
      problems.push(`\`${path}\` is a folder. Deleting a folder would remove everything inside it, so only file paths are accepted: list it with search_files and pass the files.`);
      continue;
    }
    problems.push(`\`${path}\` was not found. Confirm the exact path with search_files; deleting a path that does not exist would erase any folder of that name instead.`);
  }

  return { verified, problems };
}

async function deleteFilesTool(context: ServerContext, params: DeleteFilesParams): Promise<string> {
  const paths: string[] = [];
  for (const raw of params.paths) {
    const path = normalizeFilePath(raw);
    if (paths.includes(path)) {
      throw invalidParamError("paths", `\`${path}\` appears more than once`, "widgets/61f0000000000000000db004.tsx");
    }
    paths.push(path);
  }

  const { verified, problems } = await verifyFiles(context, paths);

  // All or nothing: one unverified path fails the whole call, so a batch can
  // never half-delete and leave the caller guessing which paths went through.
  if (problems.length > 0) {
    throw new Error(`Nothing was deleted. ${problems.length} of ${paths.length} path(s) could not be verified as files:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  }

  await context.resources.files.delete(paths);

  const freedBytes = verified.reduce((total, file) => total + file.size, 0);
  const list = verified.map((file) => `- \`${file.path}\` (${file.size} bytes)`).join("\n");
  return `Permanently deleted ${verified.length} file${verified.length === 1 ? "" : "s"}, freeing ${freedBytes} bytes:\n${list}`;
}

const deleteFilesConfigJSON: IToolConfig = {
  name: "delete_files",
  description: `Permanently deletes files from the profile's TagoIO Files storage. This cannot be undone.

Every path must be the complete path of a single existing file, exactly as search_files reports it. Each one is verified to be a file before anything is deleted, and the whole call is refused if any path is a folder, does not exist, or is a pattern. Folders are never deleted: list one with search_files and pass the files it contains.

Use it to remove leftover files, such as the custom-widget sources and bundled artifacts that outlive a deleted widget. Confirm with the user which files to remove before calling.

<example>
{"paths": ["widgets/61f0000000000000000db004.tsx"]}
</example>`,
  parameters: deleteFilesSchema,
  title: "Delete Files",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  mutationClass: "destructive",
  tool: deleteFilesTool,
};

export { deleteFilesConfigJSON };
