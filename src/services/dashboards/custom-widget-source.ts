import { RegionConfig } from "../types";

/**
 * URL validation for custom-widget source files, ported from the first-party
 * implementation (which mirrors the API server's own trusted-source gate).
 * A widget's `display.url` is accepted only when it points at a `.tsx` file
 * inside THE CALLER'S OWN TagoIO Files storage on a TagoIO-operated host;
 * external hosts, other profiles, other extensions, and path traversal are
 * all rejected before any fetch.
 */

/**
 * Hosts a widget source URL may legitimately carry for the request's region.
 * Real widgets store whichever FILES_URL/API_URL pair the deployment was
 * configured with; us-e1 answers on both the region-coded and the legacy
 * hostnames (same distribution), so both spellings are allowlisted there.
 */
function allowedWidgetSourceHosts(region: RegionConfig): Set<string> {
  const apiHost = new URL(region.api).host;
  const hosts = new Set<string>([apiHost]);
  if (apiHost.startsWith("api.")) {
    hosts.add(`files.${apiHost.slice("api.".length)}`);
  }
  if (apiHost === "api.us-e1.tago.io" || apiHost === "api.tago.io") {
    for (const legacyHost of ["api.tago.io", "files.tago.io", "api.us-e1.tago.io", "files.us-e1.tago.io"]) {
      hosts.add(legacyHost);
    }
  }
  return hosts;
}

/**
 * Extracts the profile-relative storage path of a `.tsx` widget source file
 * from a widget's `display.url`. Returns null unless the URL passes the full
 * matrix. Accepted pathname shapes (both embed the caller's profile ID, which
 * is what rejects cross-profile URLs):
 *
 *   /file/{profile}/{path}.tsx        (API host route)
 *   /{profile}/storage/{path}.tsx     (Files host route)
 */
function parseWidgetSourcePath(rawUrl: string, profileId: string, region: RegionConfig): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") {
    return null;
  }
  // URL.host includes an explicit port; allowlisted hosts never carry one, so
  // port-riding fails the set membership. Userinfo tricks never reach here:
  // WHATWG URL keeps credentials out of host.
  if (!allowedWidgetSourceHosts(region).has(url.host)) {
    return null;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  let path: string | null = null;
  const apiPrefix = `/file/${profileId}/`;
  const filesPrefix = `/${profileId}/storage/`;
  if (pathname.startsWith(apiPrefix)) {
    path = pathname.slice(apiPrefix.length);
  } else if (pathname.startsWith(filesPrefix)) {
    path = pathname.slice(filesPrefix.length);
  }

  if (!path || !path.toLowerCase().endsWith(".tsx")) {
    return null;
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }
  return path;
}

export { allowedWidgetSourceHosts, parseWidgetSourcePath };
