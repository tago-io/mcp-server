import { Dashboard, Widget } from "@tago-io/dashboard-schema";

import { invalidParamError } from "../../utils/tool-errors";

/**
 * Boundary adapter for `@tago-io/dashboard-schema`, the only module allowed
 * to import it. The package is ESM-only and ships Zod v4 schemas; every input
 * and output here is plain data so v4 types never leak into the rest of the
 * codebase (MCP input schemas stay on zod/v3). Parsed values are projected
 * back onto only the caller-supplied paths because the package injects
 * generated fields (random `id`, timestamps) and defaults on successful parse.
 */

interface ValidationIssue {
  path: string;
  message: string;
}

interface RawIssue {
  path: Array<string | number | symbol>;
  message: string;
}

type SafeParseResult = { success: true; data: unknown } | { success: false; error: { issues: RawIssue[] } };

interface SchemaLike {
  safeParse(input: unknown): SafeParseResult;
}

type ValidatedCreate = { ok: true; sanitized: Record<string, unknown> } | { ok: false; issues: ValidationIssue[] };

type ValidatedUpdate = { ok: true; merged: Record<string, unknown>; sanitizedPatch: Record<string, unknown> } | { ok: false; issues: ValidationIssue[] };

type ValidatedWidgetUpdate = { ok: true; merged: Record<string, unknown>; wireUpdate: Record<string, unknown> } | { ok: false; issues: ValidationIssue[] };

// Single cast site: the package's Zod v4 generics stay behind these minimal shapes.
const widgetCreateSchemas = Widget.widgetCreateSchemas as unknown as Record<string, SchemaLike>;
const widgetUpdateSchemas = Widget.widgetUpdateSchemas as unknown as Record<string, SchemaLike>;
const widgetCreateJSONSchemas = Widget.widgetCreateJSONSchemas as unknown as Record<string, object>;
const widgetUpdateJSONSchemas = Widget.widgetUpdateJSONSchemas as unknown as Record<string, object>;
const dashboardCreateSchema = Dashboard.zDashboardCreate as unknown as SchemaLike;
const dashboardUpdateSchema = Dashboard.zDashboardUpdate as unknown as SchemaLike;

// Derived from the schema map, not the package's type enum: the enum omits
// `gauge` and `summary` even though both have full schemas.
const WIDGET_TYPES = Object.keys(widgetCreateSchemas).sort();

const TABS_EXAMPLE = '[{ "key": "overview", "value": "Overview" }]';

// Bundler-managed display keys: the widget-bundler writeback stores
// `display.artifact_url` on every bundled widget (the API server's internal
// display schema is an open record), but the pinned package's strict display
// schemas reject it as an unrecognized key. Stripped from the CURRENT state
// before merged-candidate validation and re-attached unchanged onto the wire
// display so the PUT (wholesale column replacement) never drops it. The
// writeback writes only `url` (declared) and `artifact_url`, audited against
// the upload component. Remove once the package models the field.
const BUNDLER_MANAGED_DISPLAY_KEYS = ["artifact_url"] as const;

function splitBundlerManagedDisplay(state: Record<string, unknown>): { stripped: Record<string, unknown>; preserved: Record<string, unknown> } {
  if (!isPlainObject(state.display)) {
    return { stripped: state, preserved: {} };
  }
  const display = { ...state.display };
  const preserved: Record<string, unknown> = {};
  for (const key of BUNDLER_MANAGED_DISPLAY_KEYS) {
    if (Object.hasOwn(display, key)) {
      preserved[key] = display[key];
      delete display[key];
    }
  }
  if (Object.keys(preserved).length === 0) {
    return { stripped: state, preserved };
  }
  return { stripped: { ...state, display }, preserved };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatIssuePath(path: Array<string | number | symbol>): string {
  if (path.length === 0) {
    return "(root)";
  }
  let formatted = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      formatted += `[${segment}]`;
    } else {
      formatted += formatted.length > 0 ? `.${String(segment)}` : String(segment);
    }
  }
  return formatted;
}

function toValidationIssues(issues: RawIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({ path: formatIssuePath(issue.path), message: issue.message }));
}

/**
 * Projects parsed values back onto only the keys the caller supplied, so
 * package-injected defaults and generated fields never transit. Arrays still
 * replace atomically, but their items are projected pairwise against the
 * corresponding caller-supplied item; the package injects defaults and
 * generated IDs inside array elements too (e.g. tab conditions gain
 * `resource: "user"`), and those must not reach the wire either.
 */
function project(parsed: unknown, shape: unknown): unknown {
  if (Array.isArray(shape)) {
    if (!Array.isArray(parsed)) {
      return parsed;
    }
    return parsed.map((item, index) => (index < shape.length ? project(item, shape[index]) : item));
  }
  if (isPlainObject(shape) && isPlainObject(parsed)) {
    const projected: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      // Own-key check: `in` would pull inherited members (toString, ...) into
      // the projection for maliciously named patch keys.
      if (Object.hasOwn(parsed, key)) {
        projected[key] = project(parsed[key], shape[key]);
      }
    }
    return projected;
  }
  return parsed;
}

/** Recursive merge: plain objects merge, arrays replace atomically, explicit null clears, scalars replace. */
function mergePatch(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const existing = merged[key];
    if (isPlainObject(value) && isPlainObject(existing)) {
      merged[key] = mergePatch(existing, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

// TODO(decisions.md #33, 2026-07-20): remove when @tago-io/dashboard-schema reconciles data[].query with the server's ALLOW_METHODS (drop "all_data", add defaultQ/count/avg/sum/last_item/first_*).
// The pinned package enumerates `data[].query: "all_data"`, but the server has
// no such value; the "read all data" behavior is selected by OMITTING the
// query key. A saved "all_data" breaks the dashboard at render time, so
// caller-supplied entries are rejected here; prefetched current state is not
// re-checked (an out-of-band "all_data" must not block unrelated patches).
function assertNoAllDataQuery(data: unknown): void {
  if (!Array.isArray(data)) {
    return;
  }
  for (const [index, entry] of data.entries()) {
    if (isPlainObject(entry) && entry.query === "all_data") {
      const { query: _query, ...withoutQuery } = entry;
      throw invalidParamError(
        `data[${index}].query`,
        'the platform has no "all_data" query; omit the `query` key entirely to read all stored data for this entry',
        JSON.stringify(withoutQuery)
      );
    }
  }
}

function requireWidgetType(type: string): void {
  if (!WIDGET_TYPES.includes(type)) {
    throw invalidParamError(
      "type",
      `unknown widget type "${type}"; must be one of the ${WIDGET_TYPES.length} supported types (e.g. ${WIDGET_TYPES.slice(0, 3).join(", ")}; use widget_schema_lookup to list them all)`,
      '"gauge"'
    );
  }
}

function getWidgetSchema(type: string, mode: "create" | "update"): object {
  requireWidgetType(type);
  const schemas = mode === "create" ? widgetCreateJSONSchemas : widgetUpdateJSONSchemas;
  return schemas[type];
}

function validateWidgetCreate(candidate: unknown): ValidatedCreate {
  const shape = isPlainObject(candidate) ? candidate : {};
  const type = typeof shape.type === "string" ? shape.type : "";
  requireWidgetType(type);
  assertNoAllDataQuery(shape.data);
  const result = widgetCreateSchemas[type].safeParse(candidate);
  if (!result.success) {
    return { ok: false, issues: toValidationIssues(result.error.issues) };
  }
  return { ok: true, sanitized: project(result.data, shape) as Record<string, unknown> };
}

function validateWidgetUpdate(current: Record<string, unknown>, patch: Record<string, unknown>): ValidatedWidgetUpdate {
  const type = typeof current.type === "string" ? current.type : "";
  requireWidgetType(type);
  if ("type" in patch && patch.type !== type) {
    return { ok: false, issues: [{ path: "type", message: `widget type is immutable; this widget is "${type}". Delete and recreate to change type` }] };
  }
  assertNoAllDataQuery(patch.data);
  // Bundler-managed keys come out of the CURRENT state only; a patch that
  // names them still fails strict validation (they are not caller-writable).
  const { stripped: strippedCurrent, preserved: preservedDisplay } = splitBundlerManagedDisplay(current);
  const mergedCandidate = mergePatch(strippedCurrent, patch);
  mergedCandidate.type = type;
  const result = widgetUpdateSchemas[type].safeParse(mergedCandidate);
  if (!result.success) {
    return { ok: false, issues: toValidationIssues(result.error.issues) };
  }
  const merged = project(result.data, mergedCandidate) as Record<string, unknown>;
  const sanitizedPatch = project(result.data, patch) as Record<string, unknown>;

  // The widget PUT performs no server-side merge: each top-level JSON column
  // is replaced wholesale. A sparse nested patch on the wire would therefore
  // wipe every sibling field of the touched object. For each caller-supplied
  // top-level object key, send the COMPLETE validated merged object; arrays,
  // scalars, and explicit nulls keep the sanitized patch value.
  const wireUpdate: Record<string, unknown> = {};
  for (const key of Object.keys(sanitizedPatch)) {
    const mergedValue = merged[key];
    wireUpdate[key] = isPlainObject(sanitizedPatch[key]) && isPlainObject(mergedValue) ? mergedValue : sanitizedPatch[key];
  }

  // First-party PUT quirk: the API clears analysis_run whenever the request
  // body omits it (String(undefined) is not a 24-char ID), so every sparse
  // update would detach the widget's Analysis. Preserve the current validated
  // value unless the caller explicitly changed or cleared it.
  if (!Object.hasOwn(wireUpdate, "analysis_run") && Object.hasOwn(merged, "analysis_run") && merged.analysis_run !== undefined) {
    wireUpdate.analysis_run = merged.analysis_run;
  }

  // Re-attach bundler-managed display keys unchanged: when the wire update
  // carries a display object, the PUT replaces the whole column, and dropping
  // `artifact_url` would detach the widget's bundled artifact.
  if (Object.keys(preservedDisplay).length > 0 && isPlainObject(wireUpdate.display)) {
    wireUpdate.display = { ...wireUpdate.display, ...preservedDisplay };
  }

  return { ok: true, merged, wireUpdate };
}

type ValidatedCandidate = { ok: true } | { ok: false; issues: ValidationIssue[] };

/**
 * Validation-only entry point for validate_widget_configuration: checks a
 * complete candidate against the pinned schema for its declared type.
 * Nothing here ever reaches the SDK.
 */
function validateWidgetCandidate(candidate: unknown, mode: "create" | "update"): ValidatedCandidate {
  const shape = isPlainObject(candidate) ? candidate : {};
  const type = typeof shape.type === "string" ? shape.type : "";
  requireWidgetType(type);
  assertNoAllDataQuery(shape.data);
  const schemas = mode === "create" ? widgetCreateSchemas : widgetUpdateSchemas;
  // Update-mode candidates are typically fetched widget state, which on a
  // bundled widget legitimately carries the bundler-managed display keys the
  // strict package schema does not model. Create candidates are caller-
  // authored, so the keys stay rejected there.
  const input = mode === "update" ? splitBundlerManagedDisplay(shape).stripped : candidate;
  const result = schemas[type].safeParse(input);
  if (!result.success) {
    return { ok: false, issues: toValidationIssues(result.error.issues) };
  }
  return { ok: true };
}

/** Throws on duplicate tab keys. The package's own tabs refine is ineffective, so this local invariant is authoritative. */
function assertUniqueTabKeys(tabs: unknown): void {
  if (!Array.isArray(tabs)) {
    return;
  }
  const seen = new Set<string>();
  for (const tab of tabs) {
    if (!isPlainObject(tab) || typeof tab.key !== "string") {
      continue;
    }
    if (seen.has(tab.key)) {
      throw invalidParamError("tabs", `tab keys must be unique; "${tab.key}" appears more than once`, TABS_EXAMPLE);
    }
    seen.add(tab.key);
  }
}

function stripGeneratedFields(value: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...rest } = value;
  return rest;
}

function validateDashboardCreate(candidate: unknown, profileId: string): ValidatedCreate {
  const shape = isPlainObject(candidate) ? candidate : {};
  assertUniqueTabKeys(shape.tabs);
  // `profile` exists only in the validation candidate; the public SDK create body has no profile field.
  const result = dashboardCreateSchema.safeParse({ ...shape, profile: profileId });
  if (!result.success) {
    return { ok: false, issues: toValidationIssues(result.error.issues) };
  }
  const { profile: _profile, ...sanitized } = project(result.data, { ...shape, profile: profileId }) as Record<string, unknown>;
  return { ok: true, sanitized: stripGeneratedFields(sanitized) };
}

function validateDashboardUpdate(current: Record<string, unknown>, patch: Record<string, unknown>): ValidatedUpdate {
  const mergedCandidate = mergePatch(current, patch);
  if ("tabs" in patch) {
    assertUniqueTabKeys(patch.tabs);
  } else {
    try {
      assertUniqueTabKeys(mergedCandidate.tabs);
    } catch {
      // The duplicate came from the dashboard's stored state, not this patch;
      // blame the state and offer the recovery path.
      throw new Error(
        "The dashboard's current tabs contain duplicate keys, so this update cannot be validated. Include a corrected `tabs` array (unique keys) in this update; tabs replace atomically."
      );
    }
  }
  const result = dashboardUpdateSchema.safeParse(mergedCandidate);
  if (!result.success) {
    return { ok: false, issues: toValidationIssues(result.error.issues) };
  }
  return {
    ok: true,
    merged: stripGeneratedFields(project(result.data, mergedCandidate) as Record<string, unknown>),
    sanitizedPatch: stripGeneratedFields(project(result.data, patch) as Record<string, unknown>),
  };
}

function formatValidationIssues(issues: ValidationIssue[], toolHint: string): string {
  const lines = issues.map((issue) => `- \`${issue.path}\`: ${issue.message}`);
  return `${lines.join("\n")}\n\nFix the listed paths and retry. Use ${toolHint} for the exact schema.`;
}

export {
  assertUniqueTabKeys,
  formatValidationIssues,
  getWidgetSchema,
  validateDashboardCreate,
  validateDashboardUpdate,
  validateWidgetCandidate,
  validateWidgetCreate,
  validateWidgetUpdate,
  WIDGET_TYPES,
};
export type { ValidationIssue };
