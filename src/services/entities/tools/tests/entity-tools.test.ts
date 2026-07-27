import { Resources } from "@tago-io/sdk";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { getEntityConfigJSON } from "../get-entity";
import { searchEntitiesConfigJSON } from "../search-entities";

const ENTITY_ID = "61f0000000000000000e0001";
const REQUEST_TOKEN = "a-0000000000000000000000000000000000";

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

  // Regression (#850): the API may omit `index` (and other projected fields)
  // from a list row even when the client requested them. Explicit fields must
  // still render those columns.
  it("keeps an explicitly requested index column when the list row omits index", async () => {
    const list = vi.fn().mockResolvedValue([{ id: ENTITY_ID, name: "Temperature Sensor" }]);
    const context = makeTestContext({ resources: { entities: { list } } });

    const output = await searchEntitiesConfigJSON.tool(context, { fields: ["id", "name", "index"] });

    expect(output).toMatch(/\|\s*index\s*\|/);
    expect(output).toContain("Temperature Sensor");
  });
});

describe("search_entities against the MSW list mock", () => {
  beforeAll(() => mockServer.listen(strictListenOptions));
  afterEach(() => mockServer.resetHandlers());
  afterAll(() => mockServer.close());

  // The entity list mock deliberately omits `index` even when requested, so
  // this is the in-repo proof that #850 cannot silently regress again.
  it("still renders an index column when the MSW list row omits index", async () => {
    const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
    const output = await searchEntitiesConfigJSON.tool(makeTestContext({ resources, token: REQUEST_TOKEN }), {
      fields: ["id", "name", "index"],
    });

    expect(output).toMatch(/\|\s*index\s*\|/);
    expect(output).toContain("Sensor Registry");
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
