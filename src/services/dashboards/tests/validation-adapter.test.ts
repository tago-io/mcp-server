import { Dashboard } from "@tago-io/dashboard-schema";
import { describe, expect, it } from "vitest";

import {
  assertUniqueTabKeys,
  formatValidationIssues,
  getWidgetSchema,
  validateDashboardCreate,
  validateDashboardUpdate,
  validateWidgetCandidate,
  validateWidgetCreate,
  validateWidgetUpdate,
  WIDGET_TYPES,
} from "../validation-adapter";

const PROFILE_ID = "a".repeat(24);
const MAX_SCHEMA_BYTES = 128 * 1024;

const VALID_GAUGE_DISPLAY = { gauge_type: "solid", numberformat: "0", minimum: 0, maximum: 100 };

function validGaugeCandidate() {
  return { label: "Tank pressure", type: "gauge", display: { ...VALID_GAUGE_DISPLAY } };
}

describe("WIDGET_TYPES", () => {
  it("has exactly 40 sorted types including gauge and summary", () => {
    expect(WIDGET_TYPES).toHaveLength(40);
    expect(WIDGET_TYPES).toEqual([...WIDGET_TYPES].sort());
    expect(WIDGET_TYPES).toContain("gauge");
    expect(WIDGET_TYPES).toContain("summary");
  });
});

describe("getWidgetSchema", () => {
  it("returns a serializable draft-07 schema under 128 KiB for every type in both modes", () => {
    for (const type of WIDGET_TYPES) {
      for (const mode of ["create", "update"] as const) {
        const schema = getWidgetSchema(type, mode) as Record<string, unknown>;
        expect(schema.$schema, `${type} ${mode}`).toBe("http://json-schema.org/draft-07/schema#");
        const serialized = JSON.stringify(schema);
        expect(serialized.length, `${type} ${mode} size`).toBeLessThan(MAX_SCHEMA_BYTES);
      }
    }
  });

  it("throws an actionable error for an unknown type", () => {
    expect(() => getWidgetSchema("bogus", "create")).toThrow(/Invalid `type`.*bogus.*widget_schema_lookup.*gauge/s);
  });
});

describe("validateWidgetCreate", () => {
  it("accepts a valid gauge and projects only caller-supplied keys", () => {
    const candidate = validGaugeCandidate();
    const result = validateWidgetCreate(candidate);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // The package injects display.show_last_update: false; projection must drop it.
    expect(result.sanitized).toEqual(candidate);
    expect(Object.keys(result.sanitized)).toEqual(["label", "type", "display"]);
    expect(Object.keys(result.sanitized.display as object)).toEqual(Object.keys(VALID_GAUGE_DISPLAY));
  });

  it("rejects a gauge without display with a dotted-path issue", () => {
    const result = validateWidgetCreate({ label: "Tank pressure", type: "gauge" });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toEqual({ path: "display", message: expect.stringContaining("expected object") });
  });

  it("strips unknown top-level keys (package strip behavior) so sanitized never carries them", () => {
    const result = validateWidgetCreate({ ...validGaugeCandidate(), bogus_key: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.sanitized).not.toHaveProperty("bogus_key");
  });

  it("rejects unknown keys inside display (package strict behavior there)", () => {
    const candidate = validGaugeCandidate();
    const result = validateWidgetCreate({ ...candidate, display: { ...candidate.display, bogus_key: 1 } });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.some((issue) => issue.path === "display" && issue.message.includes("bogus_key"))).toBe(true);
  });

  it("throws an actionable error when type is missing or unknown", () => {
    expect(() => validateWidgetCreate({ label: "x", type: "bogus", display: {} })).toThrow(/Invalid `type`/);
    expect(() => validateWidgetCreate({ label: "x", display: {} })).toThrow(/Invalid `type`/);
  });

  it("accepts a minimal gauge create (enum-independent regression)", () => {
    const result = validateWidgetCreate(validGaugeCandidate());
    expect(result.ok).toBe(true);
  });

  it('rejects data[].query "all_data" locally with omit-the-key steering, never a Zod issue list', () => {
    const candidate = { ...validGaugeCandidate(), data: [{ origin: "a".repeat(24), query: "all_data" }] };
    expect(() => validateWidgetCreate(candidate)).toThrow(/Invalid `data\[0\]\.query`.*no "all_data" query.*omit the `query` key.*Valid example: \{"origin":"a{24}"\}/s);
  });

  it("accepts a data entry without query and keeps it in sanitized unchanged", () => {
    const candidate = { ...validGaugeCandidate(), data: [{ origin: "a".repeat(24) }] };
    const result = validateWidgetCreate(candidate);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.sanitized.data).toEqual([{ origin: "a".repeat(24) }]);
  });

  it("accepts a minimal summary create (enum-independent regression)", () => {
    const result = validateWidgetCreate({ label: "Summary", type: "summary", display: {} });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // All summary display fields are defaulted; none were sent, so none transit.
    expect(result.sanitized).toEqual({ label: "Summary", type: "summary", display: {} });
  });
});

describe("validateWidgetUpdate", () => {
  it("keeps a label-only patch to exactly the patch keys on the wire", () => {
    const result = validateWidgetUpdate(validGaugeCandidate(), { label: "Renamed" });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.wireUpdate).toEqual({ label: "Renamed" });
    expect(result.merged).toEqual({ ...validGaugeCandidate(), label: "Renamed" });
  });

  it("sends the COMPLETE merged object for a nested display patch because the API PUT replaces the column wholesale", () => {
    const result = validateWidgetUpdate(validGaugeCandidate(), { display: { maximum: 500 } });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.merged.display).toEqual({ ...VALID_GAUGE_DISPLAY, maximum: 500 });
    expect(result.wireUpdate).toEqual({ display: { ...VALID_GAUGE_DISPLAY, maximum: 500 } });
  });

  it("preserves deep theme siblings when patching one nested color", () => {
    const current = {
      ...validGaugeCandidate(),
      display: { ...VALID_GAUGE_DISPLAY, unit: "psi", theme: { color: { text: "#000000", needle: "#ff0000" } } },
    };
    const result = validateWidgetUpdate(current, { display: { theme: { color: { text: "#ffffff" } } } });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.wireUpdate).toEqual({
      display: { ...VALID_GAUGE_DISPLAY, unit: "psi", theme: { color: { text: "#ffffff", needle: "#ff0000" } } },
    });
  });

  it("replaces arrays atomically instead of concatenating", () => {
    const current = { ...validGaugeCandidate(), data: [{ origin: "a".repeat(24) }, { origin: "b".repeat(24) }] };
    const patch = { data: [{ origin: "c".repeat(24) }] };
    const result = validateWidgetUpdate(current, patch);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.merged.data).toEqual(patch.data);
    expect(result.wireUpdate).toEqual(patch);
  });

  it("keeps an explicit null through merged and the wire update", () => {
    const current = { ...validGaugeCandidate(), data: [{ origin: "a".repeat(24) }] };
    const result = validateWidgetUpdate(current, { data: null });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.merged.data).toBeNull();
    expect(result.wireUpdate).toEqual({ data: null });
  });

  it("preserves the current analysis_run on every wire update because the API clears it when the body omits it", () => {
    const current = { ...validGaugeCandidate(), analysis_run: "e".repeat(24) };
    const result = validateWidgetUpdate(current, { label: "Renamed" });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.wireUpdate).toEqual({ label: "Renamed", analysis_run: "e".repeat(24) });
  });

  it("uses the caller's validated analysis_run change or explicit null clear", () => {
    const current = { ...validGaugeCandidate(), analysis_run: "e".repeat(24) };
    const changed = validateWidgetUpdate(current, { analysis_run: "f".repeat(24) });
    expect(changed.ok).toBe(true);
    if (changed.ok) {
      expect(changed.wireUpdate).toEqual({ analysis_run: "f".repeat(24) });
    }
    const cleared = validateWidgetUpdate(current, { analysis_run: null });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.wireUpdate).toEqual({ analysis_run: null });
    }
  });

  it("rejects an invalid analysis_run instead of transiting it", () => {
    const result = validateWidgetUpdate(validGaugeCandidate(), { analysis_run: "not-an-id" });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.some((issue) => issue.path === "analysis_run")).toBe(true);
  });

  it("does not invent an analysis_run when the widget has none", () => {
    const result = validateWidgetUpdate(validGaugeCandidate(), { label: "Renamed" });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.wireUpdate).not.toHaveProperty("analysis_run");
  });

  it('rejects a patch whose data carries query "all_data"', () => {
    const patch = { data: [{ origin: "a".repeat(24) }, { origin: "b".repeat(24), query: "all_data" }] };
    expect(() => validateWidgetUpdate(validGaugeCandidate(), patch)).toThrow(/Invalid `data\[1\]\.query`/);
  });

  it('accepts an unrelated patch when the CURRENT state already persisted query "all_data"', () => {
    // The package still enumerates "all_data", so the merged candidate parses;
    // the local guard must only fire on caller-supplied data.
    const current = { ...validGaugeCandidate(), data: [{ origin: "a".repeat(24), query: "all_data" }] };
    const result = validateWidgetUpdate(current, { label: "Renamed" });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.wireUpdate).toEqual({ label: "Renamed" });
  });

  it("rejects a type change with an issue at path type", () => {
    const result = validateWidgetUpdate(validGaugeCandidate(), { type: "card" });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues).toEqual([{ path: "type", message: expect.stringContaining("immutable") }]);
  });

  it("never injects package defaults into widget resource array items", () => {
    const patch = { resource: [{ type: "entity", id: "a".repeat(24) }] };
    const result = validateWidgetUpdate(validGaugeCandidate(), patch);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // The package injects amount: 1000, orderBy: "desc", view: [], and
    // editable: [] into entity resource items; none of them may transit.
    expect(result.wireUpdate).toEqual(patch);
  });

  it("carries package-normalized values onto the wire (range numeric-string coercion)", () => {
    const patch = { display: { range: { type: "minmax", minimum: "1", maximum: "9" } } };
    const result = validateWidgetUpdate(validGaugeCandidate(), patch);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.wireUpdate).toEqual({ display: { ...VALID_GAUGE_DISPLAY, range: { type: "minmax", minimum: 1, maximum: 9 } } });
  });
});

describe("validateWidgetCandidate", () => {
  it('rejects data[].query "all_data" in both modes', () => {
    const candidate = { ...validGaugeCandidate(), data: [{ origin: "a".repeat(24), query: "all_data" }] };
    for (const mode of ["create", "update"] as const) {
      expect(() => validateWidgetCandidate(candidate, mode), mode).toThrow(/Invalid `data\[0\]\.query`.*omit the `query` key/s);
    }
  });

  it("accepts a data entry without query in both modes", () => {
    const candidate = { ...validGaugeCandidate(), data: [{ origin: "a".repeat(24) }] };
    for (const mode of ["create", "update"] as const) {
      expect(validateWidgetCandidate(candidate, mode), mode).toEqual({ ok: true });
    }
  });
});

describe("validateDashboardCreate", () => {
  it("injects profile for validation but omits it and generated fields from sanitized", () => {
    const candidate = { label: "Ops", tabs: [{ key: "main", value: "Main" }] };
    const result = validateDashboardCreate(candidate, PROFILE_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.sanitized).toEqual(candidate);
    for (const key of ["profile", "id", "created_at", "updated_at", "visible", "type"]) {
      expect(result.sanitized).not.toHaveProperty(key);
    }
  });

  it("rejects duplicate tab keys locally even though the package accepts them", () => {
    const tabs = [
      { key: "main", value: "Main" },
      { key: "main", value: "Duplicate" },
    ];
    // Documents the package defect: its tabs refine does not catch duplicates.
    const packageVerdict = Dashboard.zDashboardCreate.safeParse({ label: "Ops", profile: PROFILE_ID, tabs });
    expect(packageVerdict.success).toBe(true);
    expect(() => validateDashboardCreate({ label: "Ops", tabs }, PROFILE_ID)).toThrow(/Invalid `tabs`.*"main"/s);
  });

  it("accepts unique tab keys", () => {
    const tabs = [
      { key: "main", value: "Main" },
      { key: "extra", value: "Extra" },
    ];
    expect(() => assertUniqueTabKeys(tabs)).not.toThrow();
    const result = validateDashboardCreate({ label: "Ops", tabs }, PROFILE_ID);
    expect(result.ok).toBe(true);
  });

  it("returns issues for an invalid candidate", () => {
    const result = validateDashboardCreate({}, PROFILE_ID);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.some((issue) => issue.path === "label")).toBe(true);
  });
});

describe("validateDashboardUpdate", () => {
  it("merges patches and never lets id, created_at, or updated_at transit", () => {
    const current = {
      id: "b".repeat(24),
      label: "Ops",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      tabs: [{ key: "main", value: "Main" }],
    };
    const result = validateDashboardUpdate(current, { label: "Renamed", id: "c".repeat(24) });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.merged).toEqual({ label: "Renamed", tabs: [{ key: "main", value: "Main" }] });
    expect(result.sanitizedPatch).toEqual({ label: "Renamed" });
  });

  it("carries coerced arrangement numbers into sanitizedPatch", () => {
    const patch = { arrangement: [{ widget_id: "d".repeat(24), height: "2", width: "3", x: "0", y: "1" }] };
    const result = validateDashboardUpdate({ label: "Ops" }, patch);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.sanitizedPatch).toEqual({
      arrangement: [{ widget_id: "d".repeat(24), height: 2, width: 3, x: 0, y: 1 }],
    });
  });

  it("reports nested issue paths with array indices", () => {
    const result = validateDashboardUpdate({ label: "Ops" }, { arrangement: [{ height: 1, width: 1, x: 0, y: 0 }] });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.some((issue) => issue.path === "arrangement[0].widget_id")).toBe(true);
  });

  it("rejects duplicate tab keys on the merged candidate", () => {
    const current = { label: "Ops", tabs: [{ key: "main", value: "Main" }] };
    expect(() =>
      validateDashboardUpdate(current, {
        tabs: [
          { key: "x", value: "A" },
          { key: "x", value: "B" },
        ],
      })
    ).toThrow(/Invalid `tabs`.*"x"/s);
  });

  it("keeps an explicit null on a nullable public field (tabs[].hidden) through merged and sanitizedPatch", () => {
    const current = { label: "Ops", tabs: [{ key: "main", value: "Main", hidden: false }] };
    const result = validateDashboardUpdate(current, { tabs: [{ key: "main", value: "Main", hidden: null }] });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.merged.tabs).toEqual([{ key: "main", value: "Main", hidden: null }]);
    expect(result.sanitizedPatch).toEqual({ tabs: [{ key: "main", value: "Main", hidden: null }] });
  });

  it("accepts nullable arrangement[].tab and keeps the null in sanitizedPatch", () => {
    const patch = { arrangement: [{ widget_id: "d".repeat(24), x: 0, y: 0, width: 1, height: 1, tab: null }] };
    const result = validateDashboardUpdate({ label: "Ops" }, patch);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.sanitizedPatch).toEqual(patch);
  });

  it("clears collections with an empty array, sending exactly []", () => {
    const current = { label: "Ops", tabs: [{ key: "main", value: "Main" }], arrangement: [{ widget_id: "d".repeat(24), x: 0, y: 0, width: 1, height: 1 }] };
    const result = validateDashboardUpdate(current, { tabs: [], arrangement: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.sanitizedPatch).toEqual({ tabs: [], arrangement: [] });
  });

  it("never injects package defaults into array items: tab conditions keep only caller keys", () => {
    const tabs = [{ key: "main", value: "Main", conditions: [{ key: "role", value: "admin" }] }];
    const result = validateDashboardUpdate({ label: "Ops" }, { tabs });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // The package defaults conditions[].resource to "user" and can generate IDs
    // inside array items; only the caller-supplied keys may transit.
    expect(result.sanitizedPatch).toEqual({ tabs });
  });

  it("blames the stored state, not the caller, when current tabs already carry duplicates", () => {
    const current = {
      label: "Ops",
      tabs: [
        { key: "a", value: "A", hidden: false },
        { key: "a", value: "A again", hidden: false },
      ],
    };
    expect(() => validateDashboardUpdate(current, { label: "Renamed" })).toThrow(/current tabs contain duplicate keys/);
    // A patch that itself sends duplicates stays a caller error.
    expect(() => validateDashboardUpdate({ label: "Ops" }, { tabs: current.tabs })).toThrow(/Invalid `tabs`/);
  });

  it("never projects inherited members for maliciously named patch keys", () => {
    const result = validateDashboardUpdate({ label: "Ops" }, JSON.parse('{"label": "Renamed", "toString": null, "constructor": null}') as Record<string, unknown>);
    if (result.ok) {
      expect(Object.keys(result.sanitizedPatch)).not.toContain("toString");
      expect(Object.keys(result.sanitizedPatch)).not.toContain("constructor");
    } else {
      // The package may reject the unknown keys outright, which is also safe.
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("formatValidationIssues", () => {
  it("renders bulleted paths with messages and repair steering", () => {
    const body = formatValidationIssues(
      [
        { path: "display.gauge_type", message: "Invalid option" },
        { path: "display.minimum", message: "Invalid input" },
      ],
      "widget_schema_lookup"
    );
    expect(body).toContain("- `display.gauge_type`: Invalid option");
    expect(body).toContain("- `display.minimum`: Invalid input");
    expect(body).toContain("Fix the listed paths and retry. Use widget_schema_lookup for the exact schema.");
  });
});
