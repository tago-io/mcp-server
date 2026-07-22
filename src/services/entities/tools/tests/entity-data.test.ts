import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { invokeTool } from "../../../../testing/invoke-tool";
import { API, ok } from "../../../../testing/mocks/handlers";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { MAX_ENTITY_DATA_ROW_BYTES } from "../../entity-data";
import { deleteEntityDataConfigJSON } from "../delete-entity-data";
import { editEntityDataConfigJSON } from "../edit-entity-data";
import { emptyEntityDataConfigJSON } from "../empty-entity-data";
import { readEntityDataConfigJSON } from "../read-entity-data";
import { sendEntityDataConfigJSON } from "../send-entity-data";

const ENTITY_ID = fixtures.IDS.entity;
const ROW_ID = fixtures.IDS.entityDataRow;
const REQUEST_TOKEN = "a-0000000000000000000000000000000000";

/** Entity with a single-field and a two-field index for the prefix matrix. */
const INDEXED_ENTITY = {
  ...fixtures.entityInfo,
  schema: { temperature: { type: "float" }, unit: { type: "string" }, note: { type: "text" } },
  index: {
    temp_idx: { fields: ["temperature"] },
    temp_unit_idx: { fields: ["temperature", "unit"] },
  },
};

function makeContext() {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  return makeTestContext({ resources, token: REQUEST_TOKEN });
}

function useIndexedEntity() {
  mockServer.use(http.get(`${API}/entity/:entityID`, () => ok(INDEXED_ENTITY)));
}

function captureDataReads(response: unknown = [fixtures.entityDataRow]) {
  const urls: URL[] = [];
  mockServer.use(
    http.get(`${API}/entity/:entityID/data`, ({ request }) => {
      urls.push(new URL(request.url));
      return ok(response);
    })
  );
  return urls;
}

function captureBodies(method: "post" | "put" | "delete", path: string, response: unknown) {
  const bodies: unknown[] = [];
  mockServer.use(
    http[method](path, async ({ request }) => {
      bodies.push(await request.json());
      return ok(response);
    })
  );
  return bodies;
}

function extractExample(description: string): unknown {
  const match = description.match(/<example>([\s\S]*?)<\/example>/);
  return JSON.parse(match![1].trim());
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("description examples", () => {
  it.each([readEntityDataConfigJSON, sendEntityDataConfigJSON, editEntityDataConfigJSON, deleteEntityDataConfigJSON, emptyEntityDataConfigJSON])(
    "$name example validates against its own schema",
    (config) => {
      const example = extractExample(config.description);
      expect(z.object(config.parameters).safeParse(example).success).toBe(true);
    }
  );
});

describe("read_entity_data wire query", () => {
  it("sends the exact query string: index, prefix filter, paging, fields, and orderBy on the index's last field", async () => {
    useIndexedEntity();
    const urls = captureDataReads();

    await readEntityDataConfigJSON.tool(makeContext(), {
      entity_id: ENTITY_ID,
      index: "temp_unit_idx",
      filter: { temperature: "30" },
      amount: 50,
      page: 2,
      fields: ["temperature", "unit"],
      order_by: "desc",
    });

    expect(urls).toHaveLength(1);
    const query = urls[0].searchParams;
    expect(urls[0].pathname).toBe(`/entity/${ENTITY_ID}/data`);
    expect(query.get("index")).toBe("temp_unit_idx");
    expect(query.get("filter[temperature]")).toBe("30");
    expect(query.get("amount")).toBe("50");
    expect(query.get("page")).toBe("2");
    expect(query.get("fields[0]")).toBe("temperature");
    expect(query.get("fields[1]")).toBe("unit");
    // Bare direction; the server applies it to the chosen index's last field.
    expect(query.get("order_by")).toBe("desc");
  });

  it("sends only the default amount for a bare read (no index/filter/order keys)", async () => {
    const urls = captureDataReads();

    await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID });

    expect([...urls[0].searchParams.keys()]).toEqual(["amount"]);
    expect(urls[0].searchParams.get("amount")).toBe("20");
  });

  it("passes order_by through verbatim without an index (server applies it to the default index)", async () => {
    const urls = captureDataReads();

    await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, order_by: "desc" });

    expect(urls[0].searchParams.get("order_by")).toBe("desc");
    expect(urls[0].searchParams.get("orderBy")).toBeNull();
    expect(urls[0].searchParams.get("index")).toBeNull();
  });

  it("does not expose the server-ignored SDK params (skip/startDate/endDate/order)", () => {
    expect(Object.keys(readEntityDataConfigJSON.parameters).sort()).toEqual(["amount", "entity_id", "fields", "filter", "index", "order_by", "page", "response_format"]);
  });
});

describe("read_entity_data index-prefix validation matrix", () => {
  it("accepts a full prefix and a partial left-to-right prefix of the chosen index", async () => {
    useIndexedEntity();
    const urls = captureDataReads();

    await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, index: "temp_unit_idx", filter: { temperature: "30", unit: "C" } });
    await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, index: "temp_unit_idx", filter: { temperature: "30" } });

    expect(urls).toHaveLength(2);
  });

  it("rejects a filter that skips an intermediate index field, naming the field order", async () => {
    useIndexedEntity();
    const urls = captureDataReads();

    const error = await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, index: "temp_unit_idx", filter: { unit: "C" } }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/left-to-right prefix/);
    expect((error as Error).message).toContain("temperature, unit");
    expect((error as Error).message).toContain("`temperature`");
    expect(urls).toHaveLength(0);
  });

  it("rejects a filter on a field the chosen index does not cover, naming the available indexes", async () => {
    useIndexedEntity();
    const urls = captureDataReads();

    const error = await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, index: "temp_idx", filter: { note: "x" } }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("`note`");
    expect((error as Error).message).toContain("temp_idx (temperature)");
    expect((error as Error).message).toContain("temp_unit_idx (temperature, unit)");
    expect((error as Error).message).toContain("id_created_at_idx (id, created_at)");
    expect(urls).toHaveLength(0);
  });

  it("rejects an unknown index by name, listing what exists", async () => {
    useIndexedEntity();
    const urls = captureDataReads();

    const error = await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, index: "nope_idx" }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("`nope_idx`");
    expect((error as Error).message).toContain("temp_unit_idx");
    expect((error as Error).message).toContain("id_created_at_idx");
    expect(urls).toHaveLength(0);
  });

  it("validates against the default id_created_at_idx when no index is given: id prefix passes, created_at alone skips id", async () => {
    useIndexedEntity();
    const urls = captureDataReads();

    await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, filter: { id: ROW_ID } });
    expect(urls).toHaveLength(1);

    const error = await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, filter: { created_at: "2026-01-01" } }).catch((caught) => caught as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("`id`");
    expect(urls).toHaveLength(1);
  });

  it("rejects a fields selection outside the schema, naming the available fields", async () => {
    useIndexedEntity();
    const urls = captureDataReads();

    const error = await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, fields: ["temperature", "humidity"] }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("`humidity`");
    expect((error as Error).message).toContain("temperature");
    expect(urls).toHaveLength(0);
  });

  it("accepts the server-created columns (id, created_at, updated_at) in fields", async () => {
    useIndexedEntity();
    const urls = captureDataReads();

    await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, fields: ["id", "temperature", "created_at", "updated_at"] });

    expect(urls).toHaveLength(1);
  });
});

describe("read_entity_data rendering", () => {
  it("renders schema fields as concise columns with the count line", async () => {
    useIndexedEntity();
    captureDataReads([{ id: ROW_ID, temperature: 25.5, unit: "C", note: "n", created_at: "2026-01-01T00:00:00.000Z" }]);

    const result = await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID });

    expect(result).toContain("temperature");
    expect(result).toContain("25.5");
    expect(result).toContain(ROW_ID);
    expect(result).toContain("1 entity data rows");
  });

  it("renders exactly the selected fields when `fields` is supplied", async () => {
    useIndexedEntity();
    captureDataReads([{ id: ROW_ID, temperature: 25.5, created_at: "2026-01-01T00:00:00.000Z" }]);

    const result = await readEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, fields: ["temperature"] });

    expect(result).toContain("temperature");
    expect(result).not.toContain(ROW_ID);
  });
});

describe("send_entity_data", () => {
  it("sends the exact POST body: the row array as-is, including an upsert id", async () => {
    const bodies = captureBodies("post", `${API}/entity/:entityID/data`, "2 Data Added");

    const result = await sendEntityDataConfigJSON.tool(makeContext(), {
      entity_id: ENTITY_ID,
      data: [
        { temperature: 25.5, unit: "C" },
        { id: ROW_ID, temperature: 26 },
      ],
    });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual([
      { temperature: 25.5, unit: "C" },
      { id: ROW_ID, temperature: 26 },
    ]);
    expect(result).toContain("2 data row(s) stored");
    expect(result).toContain(ENTITY_ID);
  });

  it("returns a controlled count, never the raw SDK acknowledgment", async () => {
    captureBodies("post", `${API}/entity/:entityID/data`, "1 Data Added sdk-ack-sentinel");

    const result = await sendEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, data: [{ temperature: 1 }] });

    expect(result).toContain("1 data row(s) stored");
    expect(result).not.toContain("sdk-ack-sentinel");
  });

  it("documents the upsert-on-id behavior in the description", () => {
    expect(sendEntityDataConfigJSON.description).toMatch(/UPSERT/i);
    expect(sendEntityDataConfigJSON.description).toMatch(/overwrites/);
  });

  it("bounds the batch at 1-100 rows in the schema", () => {
    const schema = z.object(sendEntityDataConfigJSON.parameters);
    expect(schema.safeParse({ entity_id: ENTITY_ID, data: [] }).success).toBe(false);
    expect(schema.safeParse({ entity_id: ENTITY_ID, data: Array.from({ length: 101 }, () => ({ temperature: 1 })) }).success).toBe(false);
    expect(schema.safeParse({ entity_id: ENTITY_ID, data: Array.from({ length: 100 }, () => ({ temperature: 1 })) }).success).toBe(true);
  });

  it("rejects a row at or above 1 MiB serialized before any request", async () => {
    const bodies = captureBodies("post", `${API}/entity/:entityID/data`, "1 Data Added");
    // {"note":"aaaa..."}: pad so the serialized row reaches the cap exactly.
    const oversized = "a".repeat(MAX_ENTITY_DATA_ROW_BYTES - 11);

    const error = await sendEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, data: [{ note: oversized }] }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/1 MiB/);
    expect(bodies).toHaveLength(0);
  });

  it("redacts the request credential from reflected failures", async () => {
    mockServer.use(http.post(`${API}/entity/:entityID/data`, () => HttpResponse.json({ status: false, message: `Rejected for ${REQUEST_TOKEN}` }, { status: 400 })));

    const error = await sendEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, data: [{ temperature: 1 }] }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
  });
});

describe("edit_entity_data", () => {
  it("sends the exact PUT body and reports the update count", async () => {
    const bodies = captureBodies("put", `${API}/entity/:entityID/data`, "1 item(s) updated");

    const result = await invokeTool(editEntityDataConfigJSON, makeContext(), { entity_id: ENTITY_ID, data: [{ id: ROW_ID, temperature: 26, unit: "C" }] });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual([{ id: ROW_ID, temperature: 26, unit: "C" }]);
    expect(result).toContain("1 data row(s) updated");
    expect(result).toContain(ENTITY_ID);
  });

  it("requires an id on every entry in the schema", () => {
    const schema = z.object(editEntityDataConfigJSON.parameters);
    expect(schema.safeParse({ entity_id: ENTITY_ID, data: [{ temperature: 26 }] }).success).toBe(false);
    expect(schema.safeParse({ entity_id: ENTITY_ID, data: [{ id: ROW_ID, temperature: 26 }] }).success).toBe(true);
  });

  it("rejects an id-only entry (nothing to change) before any request", async () => {
    const bodies = captureBodies("put", `${API}/entity/:entityID/data`, "1 item(s) updated");

    const error = await invokeTool(editEntityDataConfigJSON, makeContext(), { entity_id: ENTITY_ID, data: [{ id: ROW_ID }] }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/at least one field/);
    expect(bodies).toHaveLength(0);
  });

  it("is annotated destructive: edits overwrite stored values", () => {
    expect(editEntityDataConfigJSON.annotations.destructiveHint).toBe(true);
    expect(editEntityDataConfigJSON.mutationClass).toBe("destructive");
  });
});

describe("delete_entity_data", () => {
  it("sends the exact DELETE body and reports the server's deletion count", async () => {
    const bodies = captureBodies("delete", `${API}/entity/:entityID/data`, "1 item(s) deleted");

    const result = await deleteEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID, ids: [ROW_ID, "61f0000000000000000fd002"] });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ ids: [ROW_ID, "61f0000000000000000fd002"] });
    // The server skips already-deleted ids; the reported count is the server's.
    expect(result).toContain("1 data row(s) deleted");
    expect(result).toContain(ENTITY_ID);
  });

  it("enforces the 10-id server cap in the schema with steering to empty_entity_data", () => {
    const schema = z.object(deleteEntityDataConfigJSON.parameters);
    const ids = (count: number) => Array.from({ length: count }, (_, position) => `row-${position}`);

    expect(schema.safeParse({ entity_id: ENTITY_ID, ids: ids(10) }).success).toBe(true);
    const overCap = schema.safeParse({ entity_id: ENTITY_ID, ids: ids(11) });
    expect(overCap.success).toBe(false);
    expect(JSON.stringify(overCap.success ? "" : overCap.error.issues)).toContain("empty_entity_data");
    expect(schema.safeParse({ entity_id: ENTITY_ID, ids: [] }).success).toBe(false);
  });

  it("is annotated destructive and idempotent with no confirmation flag", () => {
    expect(Object.keys(deleteEntityDataConfigJSON.parameters).sort()).toEqual(["entity_id", "ids"]);
    expect(deleteEntityDataConfigJSON.annotations.destructiveHint).toBe(true);
    expect(deleteEntityDataConfigJSON.annotations.idempotentHint).toBe(true);
  });
});

describe("empty_entity_data", () => {
  it("posts to the empty route and confirms permanence while keeping schema and indexes", async () => {
    const emptied: string[] = [];
    mockServer.use(
      http.post(`${API}/entity/:entityID/empty`, ({ params }) => {
        emptied.push(params.entityID as string);
        return ok("Data Successfully Removed");
      })
    );

    const result = await emptyEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID });

    expect(emptied).toEqual([ENTITY_ID]);
    expect(result).toContain(ENTITY_ID);
    expect(result).toMatch(/permanently removed/);
    expect(result).toMatch(/schema/);
    expect(result).toMatch(/indexes/);
  });

  it("takes only the entity_id; destructive approval is owned by the client/operator", () => {
    expect(Object.keys(emptyEntityDataConfigJSON.parameters)).toEqual(["entity_id"]);
    expect(emptyEntityDataConfigJSON.annotations.destructiveHint).toBe(true);
    expect(emptyEntityDataConfigJSON.annotations.idempotentHint).toBe(true);
    expect(emptyEntityDataConfigJSON.description).toMatch(/cannot be recovered/);
  });

  it("redacts the request credential from reflected failures", async () => {
    mockServer.use(http.post(`${API}/entity/:entityID/empty`, () => HttpResponse.json({ status: false, message: `Denied for ${REQUEST_TOKEN}` }, { status: 403 })));

    const error = await emptyEntityDataConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
  });
});
