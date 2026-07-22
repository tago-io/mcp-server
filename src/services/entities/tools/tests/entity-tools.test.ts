import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

import { makeTestContext } from "../../../../testing/context";
import { getEntityConfigJSON } from "../get-entity";
import { searchEntitiesConfigJSON } from "../search-entities";

const ENTITY_ID = "61f0000000000000000e0001";

function extractExample(description: string): unknown {
  const match = description.match(/<example>([\s\S]*?)<\/example>/);
  return JSON.parse(match![1].trim());
}

describe("search_entities", () => {
  it("description example validates against the tool schema", () => {
    const example = extractExample(searchEntitiesConfigJSON.description);
    expect(z.object(searchEntitiesConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  it("passes an exact id filter through to the SDK", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { entities: { list } } });

    await searchEntitiesConfigJSON.tool(context, { filter: { id: ENTITY_ID } });

    expect(list.mock.calls[0][0].filter).toEqual({ id: ENTITY_ID });
  });

  it("rejects an id filter that is not 24 characters", () => {
    const schema = z.object(searchEntitiesConfigJSON.parameters);
    expect(schema.safeParse({ filter: { id: "short" } }).success).toBe(false);
    expect(schema.safeParse({ filter: { id: ENTITY_ID } }).success).toBe(true);
  });

  it("passes orderBy as a top-level tuple, never inside the filter", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { entities: { list } } });

    await searchEntitiesConfigJSON.tool(context, { filter: { name: "sensor", orderBy: "created_at,desc" } });

    const query = list.mock.calls[0][0];
    expect(query.orderBy).toEqual(["created_at", "desc"]);
    expect(query.filter).toEqual({ name: "*sensor*" });
  });

  it("rejects an invalid orderBy before calling the SDK", async () => {
    const list = vi.fn();
    const context = makeTestContext({ resources: { entities: { list } } });

    await expect(searchEntitiesConfigJSON.tool(context, { filter: { orderBy: "schema,asc" } })).rejects.toThrow(/orderBy/);
    expect(list).not.toHaveBeenCalled();
  });

  it("applies the name wildcard exactly once at query build time", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { entities: { list } } });

    await searchEntitiesConfigJSON.tool(context, { filter: { name: "sensor" } });
    await searchEntitiesConfigJSON.tool(context, { filter: { name: "sensor" } });

    expect(list.mock.calls[0][0].filter.name).toBe("*sensor*");
    expect(list.mock.calls[1][0].filter.name).toBe("*sensor*");
  });

  it("works with zero filters and applies defaults", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { entities: { list } } });

    const output = await searchEntitiesConfigJSON.tool(context, {});

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ amount: 20 }));
    expect(list.mock.calls[0][0].filter).toBeUndefined();
    expect(output).toContain("No entities found");
  });

  it("renders a concise table with id, name, and tags", async () => {
    const list = vi.fn().mockResolvedValue([{ id: ENTITY_ID, name: "Temperature Sensor", tags: [], schema: { temp: { type: "float" } } }]);
    const context = makeTestContext({ resources: { entities: { list } } });

    const output = await searchEntitiesConfigJSON.tool(context, {});

    expect(output).toContain("Temperature Sensor");
    expect(output).toContain("1 entities");
    expect(output).not.toContain("float");
  });
});

describe("get_entity", () => {
  it("description example validates against the tool schema", () => {
    const example = extractExample(getEntityConfigJSON.description);
    expect(z.object(getEntityConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  it("enforces a 24-character entity_id", () => {
    const schema = z.object(getEntityConfigJSON.parameters);
    expect(schema.safeParse({ entity_id: "short" }).success).toBe(false);
    expect(schema.safeParse({ entity_id: ENTITY_ID }).success).toBe(true);
  });

  it("includes the schema in the concise view", async () => {
    const info = vi.fn().mockResolvedValue({ id: ENTITY_ID, name: "Temperature Sensor", schema: { temp: { type: "float" } } });
    const context = makeTestContext({ resources: { entities: { info } } });

    const output = await getEntityConfigJSON.tool(context, { entity_id: ENTITY_ID });

    expect(info).toHaveBeenCalledWith(ENTITY_ID);
    expect(output).toContain("schema");
    expect(output).toContain("float");
  });
});
