import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { invokeTool } from "../../../../testing/invoke-tool";
import { API, ok } from "../../../../testing/mocks/handlers";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { MAX_PAYLOAD_DECODER_ENCODED_BYTES } from "../../sdk-boundary";
import { createEntityConfigJSON } from "../create-entity";
import { deleteEntityConfigJSON } from "../delete-entity";
import { updateEntityConfigJSON } from "../update-entity";
import { updateEntitySchemaConfigJSON } from "../update-entity-schema";

const ENTITY_ID = fixtures.IDS.entity;
const REQUEST_TOKEN = "a-0000000000000000000000000000000000";
const DECODER_SENTINEL = "/* decoder-source-sentinel-do-not-print */ const payload = raw;";
const DECODER_SENTINEL_BASE64 = Buffer.from(DECODER_SENTINEL, "utf8").toString("base64");

function makeContext() {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  return makeTestContext({ resources, token: REQUEST_TOKEN });
}

function captureBodies(method: "post" | "put", path: string, response: unknown) {
  const bodies: Array<Record<string, unknown>> = [];
  mockServer.use(
    http[method](path, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
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

describe("create_entity wire bodies", () => {
  it("description example validates against the tool schema", () => {
    const example = extractExample(createEntityConfigJSON.description);
    expect(z.object(createEntityConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  it("sends the exact POST body: bare schema fields with explicit required (no action key), bare index field lists", async () => {
    const bodies = captureBodies("post", `${API}/entity`, fixtures.entityCreateResponse);

    await invokeTool(createEntityConfigJSON, makeContext(), {
      name: "Sensor Registry",
      schema: { temperature: { type: "float", required: true }, unit: { type: "string" } },
      index: { temp_idx: { fields: ["temperature"] } },
      tags: [{ key: "entity_type", value: "sensor" }],
    });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({
      name: "Sensor Registry",
      schema: {
        temperature: { type: "float", required: true },
        unit: { type: "string", required: false },
      },
      index: { temp_idx: { fields: ["temperature"] } },
      tags: [{ key: "entity_type", value: "sensor" }],
    });
  });

  it("sends a name-only create with no schema/index/tags/decoder keys", async () => {
    const bodies = captureBodies("post", `${API}/entity`, fixtures.entityCreateResponse);

    await invokeTool(createEntityConfigJSON, makeContext(), { name: "Bare Entity" });

    expect(bodies[0]).toEqual({ name: "Bare Entity" });
  });

  it("base64-encodes the payload decoder on the wire", async () => {
    const bodies = captureBodies("post", `${API}/entity`, fixtures.entityCreateResponse);

    await invokeTool(createEntityConfigJSON, makeContext(), { name: "Decoder Entity", payload_decoder: DECODER_SENTINEL });

    expect(bodies[0].payload_decoder).toBe(DECODER_SENTINEL_BASE64);
  });

  it("returns the new entity ID with send_entity_data/update_entity_schema steering", async () => {
    const result = await invokeTool(createEntityConfigJSON, makeContext(), { name: "Sensor Registry" });

    expect(result).toContain(ENTITY_ID);
    expect(result).toContain("send_entity_data");
    expect(result).toContain("update_entity_schema");
  });
});

describe("create_entity validation matrix", () => {
  const schema = z.object(createEntityConfigJSON.parameters);

  it.each(["id", "created_at", "updated_at"])("rejects the reserved field %s before any request", async (reserved) => {
    const bodies = captureBodies("post", `${API}/entity`, fixtures.entityCreateResponse);

    await expect(invokeTool(createEntityConfigJSON, makeContext(), { name: "Reserved", schema: { [reserved]: { type: "string" } } })).rejects.toThrow(/reserved/);
    expect(bodies).toHaveLength(0);
  });

  it.each(["Temperature", "temp-1", "temp 1", "temp1", ""])("rejects the malformed field name %j before any request", async (bad) => {
    const bodies = captureBodies("post", `${API}/entity`, fixtures.entityCreateResponse);

    await expect(invokeTool(createEntityConfigJSON, makeContext(), { name: "Bad Field", schema: { [bad]: { type: "string" } } })).rejects.toThrow(/\[a-z_\]/);
    expect(bodies).toHaveLength(0);
  });

  it.each(["boolean", "uuid", "date", "number"])("rejects field type %s outside the server set", (type) => {
    expect(schema.safeParse({ name: "Typed", schema: { flag: { type } } }).success).toBe(false);
  });

  it.each(["string", "text", "int", "float", "json", "timestamp"])("accepts server field type %s", (type) => {
    expect(schema.safeParse({ name: "Typed", schema: { field_a: { type } } }).success).toBe(true);
  });

  it("bounds the name at 1-100 characters", () => {
    expect(schema.safeParse({ name: "" }).success).toBe(false);
    expect(schema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
    expect(schema.safeParse({ name: "a".repeat(100) }).success).toBe(true);
  });

  it("bounds index field lists at 1-5 entries", () => {
    const fields = (count: number) => Array.from({ length: count }, (_, index) => `field_${"abcdef"[index]}`);
    expect(schema.safeParse({ name: "Idx", index: { wide_idx: { fields: fields(6) } } }).success).toBe(false);
    expect(schema.safeParse({ name: "Idx", index: { empty_idx: { fields: [] } } }).success).toBe(false);
  });

  it("rejects an index referencing a field absent from the submitted schema before any request", async () => {
    const bodies = captureBodies("post", `${API}/entity`, fixtures.entityCreateResponse);

    await expect(
      invokeTool(createEntityConfigJSON, makeContext(), { name: "Cross", schema: { temperature: { type: "float" } }, index: { humidity_idx: { fields: ["humidity"] } } })
    ).rejects.toThrow(/humidity/);
    expect(bodies).toHaveLength(0);
  });

  it("rejects an index when no schema was submitted at all", async () => {
    const bodies = captureBodies("post", `${API}/entity`, fixtures.entityCreateResponse);

    await expect(invokeTool(createEntityConfigJSON, makeContext(), { name: "No Schema", index: { temp_idx: { fields: ["temperature"] } } })).rejects.toThrow(/temperature/);
    expect(bodies).toHaveLength(0);
  });

  it("accepts a decoder at the encoded cap and rejects one just over it before any request", async () => {
    const bodies = captureBodies("post", `${API}/entity`, fixtures.entityCreateResponse);
    // 3 source bytes -> 4 base64 bytes; these lengths sit exactly at / above the cap.
    const atCap = "a".repeat((MAX_PAYLOAD_DECODER_ENCODED_BYTES / 4) * 3);
    const overCap = "a".repeat((MAX_PAYLOAD_DECODER_ENCODED_BYTES / 4) * 3 + 3);

    await invokeTool(createEntityConfigJSON, makeContext(), { name: "At Cap", payload_decoder: atCap });
    expect(bodies).toHaveLength(1);

    await expect(invokeTool(createEntityConfigJSON, makeContext(), { name: "Over Cap", payload_decoder: overCap })).rejects.toThrow(/payload_decoder/);
    expect(bodies).toHaveLength(1);
  });
});

describe("create_entity redaction", () => {
  it("redacts the submitted decoder source (plaintext and base64) and the request credential from failures", async () => {
    mockServer.use(
      http.post(`${API}/entity`, () =>
        HttpResponse.json({ status: false, message: `Rejected decoder ${DECODER_SENTINEL} (${DECODER_SENTINEL_BASE64}) for ${REQUEST_TOKEN}` }, { status: 400 })
      )
    );

    const error = await invokeTool(createEntityConfigJSON, makeContext(), { name: "Broken", payload_decoder: DECODER_SENTINEL }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(DECODER_SENTINEL);
    expect((error as Error).message).not.toContain(DECODER_SENTINEL_BASE64);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
  });
});

describe("update_entity", () => {
  it("description example validates against the tool schema", () => {
    const example = extractExample(updateEntityConfigJSON.description);
    expect(z.object(updateEntityConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  it("sends the exact PUT body for a name-only edit", async () => {
    const bodies = captureBodies("put", `${API}/entity/:entityID`, { message: "Entity Successfully Updated" });

    await invokeTool(updateEntityConfigJSON, makeContext(), { entity_id: ENTITY_ID, name: "Asset Registry" });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ name: "Asset Registry" });
  });

  it("base64-encodes a decoder change and passes null through to clear it", async () => {
    const bodies = captureBodies("put", `${API}/entity/:entityID`, { message: "Entity Successfully Updated" });

    await invokeTool(updateEntityConfigJSON, makeContext(), { entity_id: ENTITY_ID, payload_decoder: DECODER_SENTINEL });
    await invokeTool(updateEntityConfigJSON, makeContext(), { entity_id: ENTITY_ID, payload_decoder: null });

    expect(bodies[0]).toEqual({ payload_decoder: DECODER_SENTINEL_BASE64 });
    expect(bodies[1]).toEqual({ payload_decoder: null });
  });

  it("has no schema or index parameters at all", () => {
    expect(updateEntityConfigJSON.parameters).not.toHaveProperty("schema");
    expect(updateEntityConfigJSON.parameters).not.toHaveProperty("index");
    expect(updateEntityConfigJSON.description).toContain("update_entity_schema");
  });

  it("rejects an update with zero editable fields without traffic", async () => {
    const bodies = captureBodies("put", `${API}/entity/:entityID`, { message: "Entity Successfully Updated" });

    await expect(invokeTool(updateEntityConfigJSON, makeContext(), { entity_id: ENTITY_ID })).rejects.toThrow(/at least one field/);
    expect(bodies).toHaveLength(0);
  });

  it("returns a controlled confirmation, never the raw SDK acknowledgment", async () => {
    captureBodies("put", `${API}/entity/:entityID`, { message: "Entity Successfully Updated sdk-ack-sentinel" });

    const result = await invokeTool(updateEntityConfigJSON, makeContext(), { entity_id: ENTITY_ID, name: "Quiet" });

    expect(result).toContain(ENTITY_ID);
    expect(result).toMatch(/updated/i);
    expect(result).not.toContain("sdk-ack-sentinel");
  });

  it("redacts the submitted decoder (plaintext and base64) from failures", async () => {
    mockServer.use(
      http.put(`${API}/entity/:entityID`, () => HttpResponse.json({ status: false, message: `Bad decoder ${DECODER_SENTINEL} (${DECODER_SENTINEL_BASE64})` }, { status: 400 }))
    );

    const error = await invokeTool(updateEntityConfigJSON, makeContext(), { entity_id: ENTITY_ID, payload_decoder: DECODER_SENTINEL }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(DECODER_SENTINEL);
    expect((error as Error).message).not.toContain(DECODER_SENTINEL_BASE64);
  });
});

describe("delete_entity", () => {
  it("description example validates against the tool schema", () => {
    const example = extractExample(deleteEntityConfigJSON.description);
    expect(z.object(deleteEntityConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  it("sends DELETE to the entity path and reports permanence including data loss", async () => {
    const deletedIds: string[] = [];
    mockServer.use(
      http.delete(`${API}/entity/:entityID`, ({ params }) => {
        deletedIds.push(params.entityID as string);
        return ok("Entity Successfully Removed");
      })
    );

    const result = await deleteEntityConfigJSON.tool(makeContext(), { entity_id: ENTITY_ID });

    expect(deletedIds).toEqual([ENTITY_ID]);
    expect(result).toContain(ENTITY_ID);
    expect(result).toMatch(/permanent/i);
    expect(result).toMatch(/data row/i);
  });

  it("has no confirmation flag; destructive approval is owned by the client/operator", () => {
    expect(Object.keys(deleteEntityConfigJSON.parameters)).toEqual(["entity_id"]);
    expect(deleteEntityConfigJSON.annotations.destructiveHint).toBe(true);
    expect(deleteEntityConfigJSON.annotations.idempotentHint).toBe(true);
  });
});

describe("update_entity_schema wire bodies", () => {
  it("description example validates against the tool schema", () => {
    const example = extractExample(updateEntitySchemaConfigJSON.description);
    expect(z.object(updateEntitySchemaConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  it("sends the exact PUT body for a mixed field/index changeset", async () => {
    const bodies = captureBodies("put", `${API}/entity/:entityID/schema`, { message: "Entity Successfully Updated" });

    const result = await invokeTool(updateEntitySchemaConfigJSON, makeContext(), {
      entity_id: ENTITY_ID,
      fields: {
        humidity: { action: "create", type: "float" },
        temp: { action: "rename", new_name: "temperature" },
        unit: { action: "update", required: true },
        legacy: { action: "delete" },
      },
      indexes: {
        temp_idx: { action: "create", fields: ["temperature"] },
        old_idx: { action: "delete" },
      },
    });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({
      schema: {
        humidity: { action: "create", type: "float", required: false },
        temp: { action: "rename", new_name: "temperature" },
        unit: { action: "update", required: true },
        legacy: { action: "delete" },
      },
      index: {
        temp_idx: { action: "create", fields: ["temperature"] },
        old_idx: { action: "delete" },
      },
    });
    for (const change of ["humidity", "temperature", "unit", "legacy", "temp_idx", "old_idx"]) {
      expect(result).toContain(change);
    }
  });

  it("sends an index-only changeset without a schema key", async () => {
    const bodies = captureBodies("put", `${API}/entity/:entityID/schema`, { message: "Entity Successfully Updated" });

    await invokeTool(updateEntitySchemaConfigJSON, makeContext(), { entity_id: ENTITY_ID, indexes: { old_idx: { action: "delete" } } });

    expect(bodies[0]).toEqual({ index: { old_idx: { action: "delete" } } });
  });
});

describe("update_entity_schema validation matrix", () => {
  const schema = z.object(updateEntitySchemaConfigJSON.parameters);

  it("rejects an empty changeset without traffic", async () => {
    const bodies = captureBodies("put", `${API}/entity/:entityID/schema`, { message: "Entity Successfully Updated" });

    await expect(invokeTool(updateEntitySchemaConfigJSON, makeContext(), { entity_id: ENTITY_ID })).rejects.toThrow(/at least one/);
    await expect(invokeTool(updateEntitySchemaConfigJSON, makeContext(), { entity_id: ENTITY_ID, fields: {}, indexes: {} })).rejects.toThrow(/at least one/);
    expect(bodies).toHaveLength(0);
  });

  it.each(["id", "created_at", "updated_at"])("rejects any action on the reserved field %s before any request", async (reserved) => {
    const bodies = captureBodies("put", `${API}/entity/:entityID/schema`, { message: "Entity Successfully Updated" });

    await expect(invokeTool(updateEntitySchemaConfigJSON, makeContext(), { entity_id: ENTITY_ID, fields: { [reserved]: { action: "delete" } } })).rejects.toThrow(/reserved/);
    expect(bodies).toHaveLength(0);
  });

  it("rejects renaming a field to a reserved or malformed name before any request", async () => {
    const bodies = captureBodies("put", `${API}/entity/:entityID/schema`, { message: "Entity Successfully Updated" });

    await expect(invokeTool(updateEntitySchemaConfigJSON, makeContext(), { entity_id: ENTITY_ID, fields: { temp: { action: "rename", new_name: "id" } } })).rejects.toThrow(
      /reserved/
    );
    await expect(invokeTool(updateEntitySchemaConfigJSON, makeContext(), { entity_id: ENTITY_ID, fields: { temp: { action: "rename", new_name: "Temp2" } } })).rejects.toThrow(
      /\[a-z_\]/
    );
    expect(bodies).toHaveLength(0);
  });

  it("makes changing a field's type impossible: update requires the required flag and a smuggled type never reaches the wire", async () => {
    expect(schema.safeParse({ entity_id: ENTITY_ID, fields: { temp: { action: "update" } } }).success).toBe(false);
    expect(schema.safeParse({ entity_id: ENTITY_ID, fields: { temp: { action: "update", required: true } } }).success).toBe(true);
    expect(updateEntitySchemaConfigJSON.description).toMatch(/immutable/i);

    // Zod strips the unknown `type` key from the update action, so even a
    // smuggled type change cannot transit; prove it at the wire.
    const bodies = captureBodies("put", `${API}/entity/:entityID/schema`, { message: "Entity Successfully Updated" });
    const parsed = schema.parse({ entity_id: ENTITY_ID, fields: { temp: { action: "update", type: "string", required: true } } });
    await invokeTool(updateEntitySchemaConfigJSON, makeContext(), parsed);
    expect(bodies[0]).toEqual({ schema: { temp: { action: "update", required: true } } });
  });

  it("rejects unknown actions and boolean create types in the schema", () => {
    expect(schema.safeParse({ entity_id: ENTITY_ID, fields: { temp: { action: "replace" } } }).success).toBe(false);
    expect(schema.safeParse({ entity_id: ENTITY_ID, fields: { flag: { action: "create", type: "boolean" } } }).success).toBe(false);
  });
});

describe("update_entity_schema required-on-populated steering", () => {
  it("translates the server refusal into the documented optional-backfill-required workaround", async () => {
    mockServer.use(
      http.put(`${API}/entity/:entityID/schema`, () =>
        HttpResponse.json({ status: false, message: "Cannot add a required column to an entity with existing data" }, { status: 400 })
      )
    );

    const error = await updateEntitySchemaConfigJSON
      .tool(makeContext(), { entity_id: ENTITY_ID, fields: { humidity: { action: "create", type: "float", required: true } } })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/"required": false/);
    expect((error as Error).message).toMatch(/backfill/i);
    expect((error as Error).message).toMatch(/"action": "update"/);
  });

  it("passes other failures through safe formatting without the workaround text", async () => {
    mockServer.use(http.put(`${API}/entity/:entityID/schema`, () => HttpResponse.json({ status: false, message: `Entity not found for ${REQUEST_TOKEN}` }, { status: 404 })));

    const error = await updateEntitySchemaConfigJSON
      .tool(makeContext(), { entity_id: ENTITY_ID, fields: { humidity: { action: "create", type: "float" } } })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toMatch(/backfill/i);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
  });
});
