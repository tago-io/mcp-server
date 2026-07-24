import { describeErrorSafely } from "../../utils/safe-error";
import { ServerContext } from "../types";
import { MatchBy } from "./policy-rules";

/**
 * The platform's permission catalog: for each kind of token a policy can
 * target, which resources it can grant on, which actions each resource has, and
 * which match forms each action accepts.
 *
 * It is fetched rather than vendored. The catalog is what the write tools
 * validate against, and a stale copy would reject a newly valid grant while
 * accepting a retired one, so a snapshot is the one thing this check cannot be
 * built on. `GET /am/settings` returns it verbatim and is the only Access
 * Management route the SDK does not wrap.
 *
 * This transport is deliberately NOT a generic authenticated-request escape
 * hatch. The path is a constant, no caller input reaches the URL, and the only
 * thing it can retrieve is a public description of the permission model. The
 * SDK boundary remains the rule for everything else in this domain.
 */

const CATALOG_TIMEOUT_MS = 10_000;

/** One (resource, action) grant, as the platform describes it. */
interface PermissionGrant {
  /** Wire value, e.g. "send_data". */
  action: string;
  /** Display label, e.g. "Send data". Pairs with the resource label to form the name shown in the Admin console. */
  label: string;
  description: string;
  /** Match forms this grant accepts; any other form parses but never matches. */
  match_by: MatchBy[];
}

/** Target kinds a policy can apply to. AM governs these two token kinds and no others. */
const TARGET_TYPES = ["analysis", "run_user"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

interface PermissionCatalog {
  /** Resource wire name to display label, e.g. `access_management` -> "Access Management". */
  resourceLabels: Record<string, string>;
  /** Target kind -> resource -> the grants that resource offers to that kind. */
  grants: Record<TargetType, Record<string, PermissionGrant[]>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGrants(raw: unknown): PermissionGrant[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const grants: PermissionGrant[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.value !== "string") {
      continue;
    }
    grants.push({
      action: entry.value,
      label: typeof entry.label === "string" ? entry.label : entry.value,
      description: typeof entry.description === "string" ? entry.description : "",
      match_by: Array.isArray(entry.match_by) ? (entry.match_by.filter((form): form is MatchBy => typeof form === "string") as MatchBy[]) : [],
    });
  }
  return grants;
}

function parseCatalog(result: unknown): PermissionCatalog {
  if (!isRecord(result) || !isRecord(result.settings)) {
    throw new Error("the API returned an unrecognized permission catalog shape");
  }

  const resourceLabels: Record<string, string> = {};
  if (isRecord(result.resources)) {
    for (const [resource, meta] of Object.entries(result.resources)) {
      resourceLabels[resource] = isRecord(meta) && typeof meta.label === "string" ? meta.label : resource;
    }
  }

  const grants = { analysis: {}, run_user: {} } as Record<TargetType, Record<string, PermissionGrant[]>>;
  for (const targetType of TARGET_TYPES) {
    const byResource = (result.settings as Record<string, unknown>)[targetType];
    if (!isRecord(byResource)) {
      continue;
    }
    for (const [resource, rawGrants] of Object.entries(byResource)) {
      const parsed = parseGrants(rawGrants);
      if (parsed.length > 0) {
        grants[targetType][resource] = parsed;
      }
    }
  }

  if (Object.keys(grants.analysis).length === 0 && Object.keys(grants.run_user).length === 0) {
    throw new Error("the API returned a permission catalog with no grants");
  }

  return { resourceLabels, grants };
}

/** Fetches the catalog, throwing a credential-safe error when it cannot be read. */
async function fetchPermissionCatalog(context: ServerContext): Promise<PermissionCatalog> {
  let response: Response;
  try {
    response = await fetch(`${context.region.api}/am/settings`, {
      method: "GET",
      headers: { token: context.token },
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
      redirect: "error",
    });
  } catch (caught) {
    throw new Error(`Permission catalog lookup failed: ${describeErrorSafely(caught, [context.token])}`);
  }

  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch (caught) {
    throw new Error(`Permission catalog lookup failed: ${describeErrorSafely(caught, [context.token])}`);
  }

  if (!isRecord(envelope) || envelope.status !== true) {
    const message = isRecord(envelope) && typeof envelope.message === "string" ? envelope.message : `HTTP ${response.status}`;
    throw new Error(`Permission catalog lookup failed: ${describeErrorSafely(message, [context.token])}`);
  }

  return parseCatalog(envelope.result);
}

/**
 * Catalog for the write tools, which degrade rather than block when it cannot
 * be read.
 *
 * The grammar checks in `policy-rules.ts` come from the API's own parser and
 * always run. The catalog checks are the ones that need this route, and failing
 * the write when it is unavailable would send the caller back to the Admin
 * console, which is the very complaint that opened this domain. So the write
 * proceeds with the catalog checks skipped and says so in its result.
 */
async function loadCatalogForValidation(context: ServerContext): Promise<PermissionCatalog | undefined> {
  return await fetchPermissionCatalog(context).catch(() => undefined);
}

const CATALOG_UNAVAILABLE_NOTE =
  "The permission catalog (`GET /am/settings`) could not be read, so the resource/action pairing was NOT verified. The policy may not grant anything: check it with get_access_policy.";

/** Resources the given target kinds can grant on at all, deduplicated. */
function grantableResources(catalog: PermissionCatalog, targetTypes: readonly TargetType[]): string[] {
  const resources = new Set<string>();
  for (const targetType of targetTypes) {
    for (const resource of Object.keys(catalog.grants[targetType])) {
      resources.add(resource);
    }
  }
  return [...resources].sort();
}

function findGrant(catalog: PermissionCatalog, targetType: TargetType, resource: string, action: string): PermissionGrant | undefined {
  return catalog.grants[targetType][resource]?.find((grant) => grant.action === action);
}

/** Display name for a grant, matching what the Admin console shows. */
function grantLabel(catalog: PermissionCatalog, targetType: TargetType, resource: string, action: string): string {
  const resourceLabel = catalog.resourceLabels[resource] ?? resource;
  const grant = findGrant(catalog, targetType, resource, action);
  return `${resourceLabel} / ${grant?.label ?? action}`;
}

export { CATALOG_UNAVAILABLE_NOTE, TARGET_TYPES, fetchPermissionCatalog, findGrant, grantLabel, grantableResources, loadCatalogForValidation, parseCatalog };
export type { PermissionCatalog, PermissionGrant, TargetType };
