import { z } from "zod/v3";

import { convertJSONToMarkdown } from "../../../utils/markdown";
import { IToolConfig, ServerContext } from "../../types";
import { FileListEntry, listFiles } from "../files-api";

const DEFAULT_AMOUNT = 100;
const MAX_AMOUNT = 1000;
const CONCISE_FIELDS = ["filename", "size", "last_modified"] as const;
/**
 * Detailed mode adds visibility and nothing else. Unlike every other search
 * tool, this one projects instead of rendering whatever came back: a URL
 * attached to a file entry would be a signed credential, so no unrecognized
 * field from this endpoint is ever rendered.
 */
const DETAILED_FIELDS = ["filename", "size", "last_modified", "public"] as const;

const searchFilesSchema = {
  path: z
    .string()
    .describe(
      "Folder to list, relative to the profile's storage root. Defaults to the root. Listing is one level deep: subfolders come back in their own list and are read by calling again with the folder path. Custom-widget sources live under `widgets/`, their bundled artifacts under `widgets/.bundled/{widget_id}/`."
    )
    .optional(),
  amount: z
    .number()
    .int()
    .min(1)
    .max(MAX_AMOUNT)
    .describe(`Number of entries to return (min 1, max ${MAX_AMOUNT}, default ${DEFAULT_AMOUNT}). Files and folders share this budget.`)
    .optional(),
  pagination_token: z
    .string()
    .describe(
      "Cursor from a previous call's output, to fetch the next page. This API paginates by cursor, so there is no page number: omit on the first call, then pass back the token the previous call returned."
    )
    .optional(),
  // Not the shared responseFormatSchema: this tool renders a fixed projection
  // rather than every returned field, so its description must not promise one.
  response_format: z
    .enum(["concise", "detailed"])
    .describe("Response verbosity. 'concise' (default) lists path, size, and last modified; 'detailed' adds public visibility.")
    .optional(),
};

type SearchFilesParams = z.infer<z.ZodObject<typeof searchFilesSchema>>;

/** Presents a folder path the way the caller passes it back in `path`. */
function renderFolderPaths(prefix: string, folders: string[]): string[] {
  return folders.map((folder) => `${prefix}${folder}/`);
}

function shapeFile(file: FileListEntry, responseFormat?: string): Record<string, unknown> {
  const fields = responseFormat === "detailed" ? DETAILED_FIELDS : CONCISE_FIELDS;
  const shaped: Record<string, unknown> = {};
  for (const field of fields) {
    shaped[field] = file[field];
  }
  return shaped;
}

async function searchFilesTool(context: ServerContext, params: SearchFilesParams): Promise<string> {
  const requestedAmount = params.amount ?? DEFAULT_AMOUNT;
  const rawPath = params.path ?? "/";
  // The list route strips one leading slash; folders are echoed back with a
  // trailing slash so every rendered path can be pasted straight into `path`.
  const prefix = rawPath === "/" ? "" : rawPath.replace(/^\//, "");

  const response = await listFiles(context.resources, {
    path: rawPath,
    quantity: requestedAmount,
    paginationToken: params.pagination_token,
  });

  const files = response.files ?? [];
  const folders = response.folders ?? [];
  const storageLine = `File storage: ${response.usage} MB used of ${response.total} MB allocated.`;

  if (files.length === 0 && folders.length === 0) {
    return [
      `No files or folders under \`${prefix || "/"}\`.`,
      "",
      "Custom-widget sources are stored at `widgets/{widget_id}.tsx` and their bundled artifacts under `widgets/.bundled/{widget_id}/`. Deleting a widget or a dashboard does not remove either, so those paths are where leftover files accumulate.",
      "",
      storageLine,
    ].join("\n");
  }

  const sections: string[] = [];

  if (folders.length > 0) {
    sections.push(`**Folders** (list one by passing it as \`path\`)`, convertJSONToMarkdown(renderFolderPaths(prefix, folders)), "");
  }

  if (files.length > 0) {
    sections.push(`**Files** (\`size\` in bytes)`, convertJSONToMarkdown(files.map((file) => shapeFile(file, params.response_format))), "");
  }

  sections.push(`${files.length} file${files.length === 1 ? "" : "s"} and ${folders.length} folder${folders.length === 1 ? "" : "s"} under \`${prefix || "/"}\`.`);
  sections.push(storageLine);

  if (response.pagination_token) {
    sections.push(`More entries exist: call again with pagination_token: "${response.pagination_token}".`);
  }

  if (params.response_format !== "detailed") {
    sections.push(`Concise view. Use response_format: "detailed" to also show public visibility.`);
  }

  return sections.join("\n");
}

const searchFilesConfigJSON: IToolConfig = {
  name: "search_files",
  description: `Lists the files and folders stored in the profile's TagoIO Files storage, one folder level per call.

Use it to inspect stored files and to find leftovers that no longer belong to anything: deleting a widget or a dashboard does not remove the files it created, so custom-widget sources (\`widgets/{widget_id}.tsx\`) and bundled artifacts (\`widgets/.bundled/{widget_id}/\`) survive their widget and keep consuming the profile's file storage. Cross-check the widget IDs found here against the widgets that still exist before removing anything with delete_files.

Pagination is by cursor, not page number: when the output reports a pagination_token, pass it back to read the next page.

<example>
{"path": "widgets/"}
</example>`,
  parameters: searchFilesSchema,
  title: "Search Files",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: searchFilesTool,
};

export { searchFilesConfigJSON };
