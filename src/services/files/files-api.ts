import { Resources } from "@tago-io/sdk";

/**
 * The Files list route returns more than the SDK's `FileListInfo` models: the
 * pagination cursor, per-file visibility, and the profile's storage allocation
 * and usage are all on the wire but absent from the published type. Reading
 * them requires this local shape.
 *
 * Nothing here carries a URL. Signed URLs come only from `getFileURLSigned`,
 * which is a credential and is never called by any tool in this domain.
 */
interface FileListEntry {
  filename: string;
  size: number;
  last_modified?: string | Date | null;
  public?: boolean;
}

interface FileListResponse {
  files: FileListEntry[];
  folders: string[];
  /** Opaque cursor for the next page; absent on the last page. */
  pagination_token?: string;
  /** Allocated file storage, in MB. */
  total: number;
  /** File storage used this month, in MB. */
  usage: number;
}

/** Single point where the incomplete SDK type is widened to the real response. */
async function listFiles(resources: Resources, query: { path: string; quantity: number; paginationToken?: string }): Promise<FileListResponse> {
  const response = await resources.files.list(query);
  return response as unknown as FileListResponse;
}

export { FileListEntry, FileListResponse, listFiles };
