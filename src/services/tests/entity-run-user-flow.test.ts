import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { makeTestContext, TEST_REGION } from "../../testing/context";
import { fixtures } from "../../testing/mocks/fixtures";
import { API, ok } from "../../testing/mocks/handlers";
import { mockServer, strictListenOptions } from "../../testing/mocks/server";
import { createEntityConfigJSON } from "../entities/tools/create-entity";
import { deleteEntityConfigJSON } from "../entities/tools/delete-entity";
import { deleteEntityDataConfigJSON } from "../entities/tools/delete-entity-data";
import { editEntityDataConfigJSON } from "../entities/tools/edit-entity-data";
import { getEntityConfigJSON } from "../entities/tools/get-entity";
import { readEntityDataConfigJSON } from "../entities/tools/read-entity-data";
import { sendEntityDataConfigJSON } from "../entities/tools/send-entity-data";
import { updateEntitySchemaConfigJSON } from "../entities/tools/update-entity-schema";
import { createRunUserConfigJSON } from "../run-users/tools/create-run-user";
import { deleteRunUserConfigJSON } from "../run-users/tools/delete-run-user";
import { getRunUserConfigJSON } from "../run-users/tools/get-run-user";
import { loginAsRunUserConfigJSON } from "../run-users/tools/login-as-run-user";
import { sendRunUserNotificationConfigJSON } from "../run-users/tools/send-run-user-notification";

const ENTITY_ID = fixtures.IDS.entity;
const ROW_A_ID = fixtures.IDS.entityDataRow;
const ROW_B_ID = "61f0000000000000000fd002";
const ROW_C_ID = "61f0000000000000000fd003";
const RUN_USER_ID = fixtures.IDS.user;
const NOTIFICATION_ID = fixtures.IDS.notification;
const REQUEST_TOKEN = "a-0000000000000000000000000000000000";
const PASSWORD_SENTINEL = "FLOW-SENTINEL-PASSWORD-9f4e";
// Token the mock login route mints; the sentinel lets the final sweep prove it
// appears in the one intentional login_as_run_user output and nowhere else.
const MINTED_LOGIN_TOKEN = "ru-FLOW-MINTED-TOKEN-77aa-000000000001";

interface EntityFieldDefinition {
  type?: string;
  required?: boolean;
}

interface SchemaChange extends EntityFieldDefinition {
  action: "create" | "update" | "rename" | "delete";
  new_name?: string;
}

interface IndexChange {
  action: "create" | "delete";
  fields?: string[];
}

interface FakeEntity {
  created: boolean;
  deleted: boolean;
  name: string;
  schema: Record<string, EntityFieldDefinition>;
  index: Record<string, { fields: string[] }>;
  rows: Map<string, Record<string, unknown>>;
  schemaChangesets: unknown[];
}

interface FakeRunUser {
  created: boolean;
  deleted: boolean;
  name: string;
  password: string;
  notificationTitles: string[];
  loginHits: number;
}

function makeContext() {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  return makeTestContext({ resources, token: REQUEST_TOKEN });
}

/** Stateful handlers closing over one mutable fake entity record. */
function useStatefulEntity(record: FakeEntity) {
  const rowIdQueue = [ROW_A_ID, ROW_B_ID, ROW_C_ID];

  mockServer.use(
    http.post(`${API}/entity`, async ({ request }) => {
      const body = (await request.json()) as { name: string; schema?: Record<string, EntityFieldDefinition>; index?: Record<string, { fields: string[] }> };
      record.created = true;
      record.name = body.name;
      record.schema = body.schema ?? {};
      record.index = body.index ?? {};
      return ok({ id: ENTITY_ID });
    }),
    http.put(`${API}/entity/:entityID/schema`, async ({ request }) => {
      const body = (await request.json()) as { schema?: Record<string, SchemaChange>; index?: Record<string, IndexChange> };
      record.schemaChangesets.push(body);
      for (const [fieldName, change] of Object.entries(body.schema ?? {})) {
        if (change.action === "create") {
          record.schema[fieldName] = { type: change.type, required: change.required };
        } else if (change.action === "update") {
          record.schema[fieldName] = { ...record.schema[fieldName], required: change.required };
        } else if (change.action === "rename") {
          record.schema[change.new_name as string] = record.schema[fieldName];
          delete record.schema[fieldName];
        } else {
          delete record.schema[fieldName];
        }
      }
      for (const [indexName, change] of Object.entries(body.index ?? {})) {
        if (change.action === "create") {
          record.index[indexName] = { fields: change.fields ?? [] };
        } else {
          delete record.index[indexName];
        }
      }
      return ok({ message: "Entity Successfully Updated" });
    }),
    http.get(`${API}/entity/:entityID`, () =>
      record.deleted
        ? HttpResponse.json({ status: false, message: "Entity Not Found" }, { status: 404 })
        : ok({
            id: ENTITY_ID,
            name: record.name,
            schema: record.schema,
            index: record.index,
            tags: [],
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z",
          })
    ),
    http.post(`${API}/entity/:entityID/data`, async ({ request }) => {
      const rows = (await request.json()) as Array<Record<string, unknown>>;
      for (const row of rows) {
        const rowId = typeof row.id === "string" ? row.id : (rowIdQueue.shift() as string);
        record.rows.set(rowId, { created_at: "2026-01-01T00:00:00.000Z", ...record.rows.get(rowId), ...row, id: rowId });
      }
      return ok(`${rows.length} Data Added`);
    }),
    http.get(`${API}/entity/:entityID/data`, ({ request }) => {
      const temperature = new URL(request.url).searchParams.get("filter[temperature]");
      const rows = [...record.rows.values()].filter((row) => temperature === null || String(row.temperature) === temperature);
      return ok(rows);
    }),
    http.put(`${API}/entity/:entityID/data`, async ({ request }) => {
      const edits = (await request.json()) as Array<{ id: string } & Record<string, unknown>>;
      let updated = 0;
      for (const edit of edits) {
        const current = record.rows.get(edit.id);
        if (current) {
          record.rows.set(edit.id, { ...current, ...edit });
          updated += 1;
        }
      }
      return ok(`${updated} item(s) updated`);
    }),
    http.delete(`${API}/entity/:entityID/data`, async ({ request }) => {
      const body = (await request.json()) as { ids: string[] };
      let deleted = 0;
      for (const rowId of body.ids) {
        if (record.rows.delete(rowId)) {
          deleted += 1;
        }
      }
      return ok(`${deleted} item(s) deleted`);
    }),
    http.delete(`${API}/entity/:entityID`, () => {
      record.deleted = true;
      return ok("Entity Successfully Removed");
    })
  );
}

/** Stateful handlers closing over one mutable fake run-user record. */
function useStatefulRunUser(record: FakeRunUser) {
  mockServer.use(
    http.post(`${API}/run/users`, async ({ request }) => {
      const body = (await request.json()) as { name: string; password: string };
      record.created = true;
      record.name = body.name;
      // The fake record holds the password so a mock could reflect it; the
      // final sweep proves it never crosses any tool output or error.
      record.password = body.password;
      return ok({ user: RUN_USER_ID });
    }),
    http.get(`${API}/run/users/:userID/login`, () => {
      record.loginHits += 1;
      // `name` is the minted token's label, mirroring the real server response.
      return ok({
        token: MINTED_LOGIN_TOKEN,
        name: "Login by Run Administrator(admin@example.com)",
        run_user: RUN_USER_ID,
        expire_time: "2026-01-01T01:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
      });
    }),
    http.get(`${API}/run/users/:userID`, () =>
      record.deleted ? HttpResponse.json({ status: false, message: "User Not Found" }, { status: 404 }) : ok({ ...fixtures.runUserInfo, id: RUN_USER_ID, name: record.name })
    ),
    http.post(`${API}/run/notification/`, async ({ request }) => {
      const body = (await request.json()) as { run_user: string; title: string; message: string };
      record.notificationTitles.push(body.title);
      return ok({ id: NOTIFICATION_ID });
    }),
    http.delete(`${API}/run/users/:userID`, () => {
      record.deleted = true;
      return ok("Successfully Removed");
    })
  );
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("entity and run-user provisioning flow", () => {
  it("drives entity create → schema change → data lifecycle → run-user create → notify → clamped login → cleanup with failure injections and no secret leaks", async () => {
    const entity: FakeEntity = { created: false, deleted: false, name: "", schema: {}, index: {}, rows: new Map(), schemaChangesets: [] };
    const runUser: FakeRunUser = { created: false, deleted: false, name: "", password: "", notificationTitles: [], loginHits: 0 };
    useStatefulEntity(entity);
    useStatefulRunUser(runUser);
    const context = makeContext();
    // Every tool output and error message across the flow, checked at the end
    // against all sentinel secrets.
    const transcript: string[] = [];

    async function call(config: { tool: (ctx: typeof context, params: never) => Promise<string> }, params: Record<string, unknown>): Promise<string> {
      const output = await config.tool(context, params as never);
      transcript.push(output);
      return output;
    }

    async function callExpectingError(config: { tool: (ctx: typeof context, params: never) => Promise<string> }, params: Record<string, unknown>): Promise<string> {
      const caught = await config.tool(context, params as never).then(
        () => undefined,
        (error) => error as unknown
      );
      expect(caught).toBeDefined();
      const message = caught instanceof Error ? caught.message : String(caught);
      transcript.push(message);
      return message;
    }

    const created = await call(createEntityConfigJSON, {
      name: "Flow Sensor Registry",
      schema: { temperature: { type: "float", required: true }, unit: { type: "string" } },
      index: { temp_idx: { fields: ["temperature"] } },
    });
    expect(created).toContain(ENTITY_ID);
    expect(entity.created).toBe(true);
    expect(entity.schema).toEqual({ temperature: { type: "float", required: true }, unit: { type: "string", required: false } });

    await call(updateEntitySchemaConfigJSON, {
      entity_id: ENTITY_ID,
      fields: { note: { action: "create", type: "text" } },
      indexes: { temp_unit_idx: { action: "create", fields: ["temperature", "unit"] } },
    });
    expect(entity.schemaChangesets).toEqual([
      {
        schema: { note: { action: "create", type: "text", required: false } },
        index: { temp_unit_idx: { action: "create", fields: ["temperature", "unit"] } },
      },
    ]);

    // Send failure injection: a reflected client error yields a redacted
    // controlled error and no stored rows. (5xx is unusable here: the SDK
    // transparently retries server errors with multi-second backoff.)
    mockServer.use(
      http.post(`${API}/entity/:entityID/data`, () => HttpResponse.json({ status: false, message: `Rows rejected for ${REQUEST_TOKEN}` }, { status: 400 }), { once: true })
    );
    const sendError = await callExpectingError(sendEntityDataConfigJSON, { entity_id: ENTITY_ID, data: [{ temperature: 21.5, unit: "C" }] });
    expect(sendError).not.toContain(REQUEST_TOKEN);
    expect(entity.rows.size).toBe(0);

    const sent = await call(sendEntityDataConfigJSON, {
      entity_id: ENTITY_ID,
      data: [
        { temperature: 21.5, unit: "C" },
        { temperature: 30, unit: "C" },
        { temperature: 30, unit: "F" },
      ],
    });
    expect(sent).toContain("3 data row(s) stored");
    expect(entity.rows.size).toBe(3);

    // Read through the changeset-added index: the prefix validation runs
    // against the prefetched entity, so this only passes if the schema
    // changeset landed on the fake record.
    const readOutput = await call(readEntityDataConfigJSON, { entity_id: ENTITY_ID, index: "temp_unit_idx", filter: { temperature: "30" } });
    expect(readOutput).toContain("2 entity data rows");
    expect(readOutput).toContain(ROW_B_ID);
    expect(readOutput).toContain(ROW_C_ID);
    expect(readOutput).not.toContain(ROW_A_ID);

    const edited = await call(editEntityDataConfigJSON, { entity_id: ENTITY_ID, data: [{ id: ROW_B_ID, temperature: 31.5, unit: "K" }] });
    expect(edited).toContain("1 data row(s) updated");
    expect(entity.rows.get(ROW_B_ID)).toMatchObject({ temperature: 31.5, unit: "K" });

    // Run-user create failure injection: a password-policy rejection that
    // reflects the password and credential surfaces fully redacted.
    mockServer.use(
      http.post(`${API}/run/users`, () => HttpResponse.json({ status: false, message: `Password policy rejected '${PASSWORD_SENTINEL}' for ${REQUEST_TOKEN}` }, { status: 400 }), {
        once: true,
      })
    );
    const createUserError = await callExpectingError(createRunUserConfigJSON, {
      name: "Flow Operator",
      email: "flow-operator@example.com",
      password: PASSWORD_SENTINEL,
      timezone: "UTC",
      active: true,
    });
    expect(createUserError).not.toContain(PASSWORD_SENTINEL);
    expect(createUserError).not.toContain(REQUEST_TOKEN);
    expect(runUser.created).toBe(false);

    const userCreated = await call(createRunUserConfigJSON, {
      name: "Flow Operator",
      email: "flow-operator@example.com",
      password: PASSWORD_SENTINEL,
      timezone: "UTC",
      active: true,
    });
    expect(userCreated).toContain(RUN_USER_ID);
    expect(runUser.created).toBe(true);
    expect(runUser.password).toBe(PASSWORD_SENTINEL);

    const notified = await call(sendRunUserNotificationConfigJSON, { run_user_id: RUN_USER_ID, title: "Registry ready", message: "The sensor registry is live." });
    expect(notified).toContain(NOTIFICATION_ID);
    expect(runUser.notificationTitles).toEqual(["Registry ready"]);

    // The expiry clamp refuses a non-expiring login locally; no request fired.
    const clampError = await callExpectingError(loginAsRunUserConfigJSON, { run_user_id: RUN_USER_ID, expire_time: "never" });
    expect(clampError).toMatch(/never|revoked|revoke/i);
    expect(runUser.loginHits).toBe(0);

    // Successful login: the minted token is returned intentionally, labeled
    // as a live credential.
    const loginOutput = await call(loginAsRunUserConfigJSON, { run_user_id: RUN_USER_ID, expire_time: "1 hour" });
    expect(loginOutput).toContain(MINTED_LOGIN_TOKEN);
    expect(loginOutput).toMatch(/live credential/i);
    expect(loginOutput).toContain("2026-01-01T01:00:00.000Z");
    expect(runUser.loginHits).toBe(1);

    // Cleanup: rows first, explicit ids under the 10-id cap.
    const rowsDeleted = await call(deleteEntityDataConfigJSON, { entity_id: ENTITY_ID, ids: [ROW_A_ID, ROW_B_ID, ROW_C_ID] });
    expect(rowsDeleted).toContain("3 data row(s) deleted");
    expect(entity.rows.size).toBe(0);

    await call(deleteRunUserConfigJSON, { run_user_id: RUN_USER_ID });
    expect(runUser.deleted).toBe(true);

    mockServer.use(
      http.delete(`${API}/entity/:entityID`, () => HttpResponse.json({ status: false, message: `Could not remove entity ${ENTITY_ID}` }, { status: 400 }), { once: true })
    );
    const deleteError = await callExpectingError(deleteEntityConfigJSON, { entity_id: ENTITY_ID });
    expect(deleteError).toContain(ENTITY_ID);
    expect(entity.deleted).toBe(false);

    await call(deleteEntityConfigJSON, { entity_id: ENTITY_ID });
    expect(entity.deleted).toBe(true);

    await callExpectingError(getEntityConfigJSON, { entity_id: ENTITY_ID });
    await callExpectingError(getRunUserConfigJSON, { run_user_id: RUN_USER_ID });

    // No secret ever crossed any output or error in the whole flow, and the
    // minted login token appears only in the one intentional login output.
    expect(transcript.length).toBeGreaterThan(0);
    for (const output of transcript) {
      expect(output).not.toContain(REQUEST_TOKEN);
      expect(output).not.toContain(PASSWORD_SENTINEL);
    }
    expect(transcript.filter((output) => output.includes(MINTED_LOGIN_TOKEN))).toEqual([loginOutput]);
  });
});
