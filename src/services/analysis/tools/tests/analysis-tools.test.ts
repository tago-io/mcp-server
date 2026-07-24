import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

import { makeTestContext } from "../../../../testing/context";
import { getAnalysisConfigJSON } from "../get-analysis";
import { analysisTools } from "../index";
import { searchAnalysesConfigJSON } from "../search-analyses";

const ANALYSIS_ID = "61f0000000000000000a0001";

function extractExample(description: string): unknown {
  const match = description.match(/<example>([\s\S]*?)<\/example>/);
  return JSON.parse(match![1].trim());
}

describe("analysis tool descriptions", () => {
  it("every tool's <example> validates against its own schema", () => {
    for (const tool of analysisTools) {
      const result = z.object(tool.parameters).safeParse(extractExample(tool.description));
      expect(result.success, `example for tool "${tool.name}" fails its own schema: ${result.success ? "" : result.error.message}`).toBe(true);
    }
  });
});

describe("search_analyses", () => {
  it("description example validates against the tool schema", () => {
    const example = extractExample(searchAnalysesConfigJSON.description);
    expect(z.object(searchAnalysesConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  it("applies the name wildcard exactly once at query build time", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { analysis: { list } } });

    await searchAnalysesConfigJSON.tool(context, { filter: { name: "invoice" } });
    await searchAnalysesConfigJSON.tool(context, { filter: { name: "invoice" } });

    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[0][0].filter.name).toBe("*invoice*");
    expect(list.mock.calls[1][0].filter.name).toBe("*invoice*");
  });

  it("works with zero filters and applies defaults", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { analysis: { list } } });

    const output = await searchAnalysesConfigJSON.tool(context, {});

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ amount: 20 }));
    expect(list.mock.calls[0][0].filter).toBeUndefined();
    expect(output).toContain("No analyses found");
  });

  it("passes orderBy as a top-level tuple, never inside the filter", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { analysis: { list } } });

    await searchAnalysesConfigJSON.tool(context, { filter: { name: "invoice", orderBy: "last_run,desc" } });

    const query = list.mock.calls[0][0];
    expect(query.orderBy).toEqual(["last_run", "desc"]);
    expect(query.filter).toEqual({ name: "*invoice*" });
  });

  it("rejects an invalid orderBy before calling the SDK", async () => {
    const list = vi.fn();
    const context = makeTestContext({ resources: { analysis: { list } } });

    await expect(searchAnalysesConfigJSON.tool(context, { filter: { orderBy: "name" } })).rejects.toThrow(/orderBy/);
    expect(list).not.toHaveBeenCalled();
  });

  it("has no include_console parameter and never requests the console field", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { analysis: { list } } });

    expect(searchAnalysesConfigJSON.parameters).not.toHaveProperty("include_console");
    await searchAnalysesConfigJSON.tool(context, {});
    expect(list.mock.calls[0][0].fields).not.toContain("console");
  });

  it.each(["node-legacy", "python-legacy", "node-rt2025", "python-rt2025", "deno-rt2025", "other"])("accepts the %s runtime filter", (runtime) => {
    const schema = z.object(searchAnalysesConfigJSON.parameters);
    expect(schema.safeParse({ filter: { runtime } }).success).toBe(true);
  });

  it("rejects an unknown runtime filter value", () => {
    const schema = z.object(searchAnalysesConfigJSON.parameters);
    expect(schema.safeParse({ filter: { runtime: "node" } }).success).toBe(false);
  });

  it("renders a concise table with a count line", async () => {
    const list = vi
      .fn()
      .mockResolvedValue([
        { id: ANALYSIS_ID, name: "Invoice Analysis", runtime: "node-rt2025", active: true, run_on: "tago", variables: [{ key: "SOME_KEY", value: "internal" }] },
      ]);
    const context = makeTestContext({ resources: { analysis: { list } } });

    const output = await searchAnalysesConfigJSON.tool(context, {});

    expect(output).toContain("Invoice Analysis");
    expect(output).toContain("1 analyses");
    expect(output).not.toContain("internal");
  });

  // Regression (#850): safe-projection renames `variables` to
  // `environment_variable_keys`, so `fields: ["variables"]` can never render
  // that column. Drop `variables` from the selectable fields enum instead of
  // exposing a name the projection will never emit.
  it("rejects variables in the fields selection (projection never emits that key)", () => {
    const schema = z.object(searchAnalysesConfigJSON.parameters);
    expect(schema.safeParse({ fields: ["variables"] }).success).toBe(false);
    expect(schema.safeParse({ fields: ["id", "name", "runtime"] }).success).toBe(true);
  });
});

describe("get_analysis", () => {
  it("description example validates against the tool schema", () => {
    const example = extractExample(getAnalysisConfigJSON.description);
    expect(z.object(getAnalysisConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  it("enforces a 24-character analysis_id", () => {
    const schema = z.object(getAnalysisConfigJSON.parameters);
    expect(schema.safeParse({ analysis_id: "short" }).success).toBe(false);
    expect(schema.safeParse({ analysis_id: ANALYSIS_ID }).success).toBe(true);
  });

  it("renders SDK-parsed Date timestamps meaningfully after credential stripping", async () => {
    const info = vi.fn().mockResolvedValue({
      id: ANALYSIS_ID,
      name: "Invoice Analysis",
      runtime: "node",
      active: true,
      token: "a-secret-should-never-print",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-02T00:00:00.000Z"),
      last_run: new Date("2026-01-03T00:00:00.000Z"),
    });
    const context = makeTestContext({ resources: { analysis: { info } } });

    const output = await getAnalysisConfigJSON.tool(context, { analysis_id: ANALYSIS_ID });

    expect(output).toContain("2026-01-01");
    expect(output).toContain("2026-01-02");
    expect(output).toContain("2026-01-03");
    expect(output).not.toContain("a-secret-should-never-print");
  });

  it("fetches the analysis by ID and renders it", async () => {
    const info = vi.fn().mockResolvedValue({ id: ANALYSIS_ID, name: "Invoice Analysis", runtime: "node", active: true });
    const context = makeTestContext({ resources: { analysis: { info } } });

    const output = await getAnalysisConfigJSON.tool(context, { analysis_id: ANALYSIS_ID });

    expect(info).toHaveBeenCalledWith(ANALYSIS_ID);
    expect(output).toContain("Invoice Analysis");
  });
});
