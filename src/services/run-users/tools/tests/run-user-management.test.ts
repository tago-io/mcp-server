import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { invokeTool } from "../../../../testing/invoke-tool";
import { API, ok } from "../../../../testing/mocks/handlers";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { clampExpireTime } from "../../expiry-clamp";
import { createRunUserConfigJSON } from "../create-run-user";
import { deleteRunUserConfigJSON } from "../delete-run-user";
import { deleteRunUserNotificationConfigJSON } from "../delete-run-user-notification";
import { loginAsRunUserConfigJSON } from "../login-as-run-user";
import { readRunUserNotificationsConfigJSON } from "../read-run-user-notifications";
import { sendRunUserNotificationConfigJSON } from "../send-run-user-notification";
import { updateRunUserConfigJSON } from "../update-run-user";
import { updateRunUserNotificationConfigJSON } from "../update-run-user-notification";

const RUN_USER_ID = fixtures.IDS.user;
const NOTIFICATION_ID = fixtures.IDS.notification;
const REQUEST_TOKEN = "a-0000000000000000000000000000000000";
const PASSWORD_SENTINEL = "password-sentinel-do-not-print";

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

describe("create_run_user", () => {
  it("description example validates against the tool schema", () => {
    const example = extractExample(createRunUserConfigJSON.description);
    expect(z.object(createRunUserConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  it("sends the exact POST body with only the supplied fields", async () => {
    const bodies = captureBodies("post", `${API}/run/users`, fixtures.runUserCreateResponse);

    await createRunUserConfigJSON.tool(makeContext(), {
      name: "Jane Doe",
      email: "jane@example.com",
      password: PASSWORD_SENTINEL,
      timezone: "America/New_York",
      active: true,
      tags: [{ key: "user_type", value: "admin" }],
    });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({
      name: "Jane Doe",
      email: "jane@example.com",
      password: PASSWORD_SENTINEL,
      timezone: "America/New_York",
      active: true,
      tags: [{ key: "user_type", value: "admin" }],
    });
  });

  it("omits optional keys entirely when not supplied", async () => {
    const bodies = captureBodies("post", `${API}/run/users`, fixtures.runUserCreateResponse);

    await createRunUserConfigJSON.tool(makeContext(), { name: "Bare", email: "bare@example.com", password: PASSWORD_SENTINEL, timezone: "UTC" });

    expect(bodies[0]).toEqual({ name: "Bare", email: "bare@example.com", password: PASSWORD_SENTINEL, timezone: "UTC" });
  });

  it("returns the new user ID and never echoes the password", async () => {
    const result = await createRunUserConfigJSON.tool(makeContext(), { name: "Jane", email: "jane@example.com", password: PASSWORD_SENTINEL, timezone: "UTC" });

    expect(result).toContain(RUN_USER_ID);
    expect(result).not.toContain(PASSWORD_SENTINEL);
  });

  it("redacts the password and request credential from a reflected failure (password-policy rejection)", async () => {
    mockServer.use(
      http.post(`${API}/run/users`, () => HttpResponse.json({ status: false, message: `Password policy rejected '${PASSWORD_SENTINEL}' for ${REQUEST_TOKEN}` }, { status: 400 }))
    );

    const error = await createRunUserConfigJSON
      .tool(makeContext(), { name: "Jane", email: "jane@example.com", password: PASSWORD_SENTINEL, timezone: "UTC" })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(PASSWORD_SENTINEL);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
  });

  it("has no email rename path other than at creation; schema requires email", () => {
    const schema = z.object(createRunUserConfigJSON.parameters);
    expect(schema.safeParse({ name: "X", password: "abcdef", timezone: "UTC" }).success).toBe(false);
  });
});

describe("update_run_user", () => {
  it("sends the exact PUT body with only changed fields", async () => {
    const bodies = captureBodies("put", `${API}/run/users/:userID`, "Successfully Updated");

    await invokeTool(updateRunUserConfigJSON, makeContext(), { run_user_id: RUN_USER_ID, name: "Jane Roe", active: false });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ name: "Jane Roe", active: false });
  });

  it("sends a password change and never echoes it", async () => {
    const bodies = captureBodies("put", `${API}/run/users/:userID`, "Successfully Updated");

    const result = await invokeTool(updateRunUserConfigJSON, makeContext(), { run_user_id: RUN_USER_ID, password: PASSWORD_SENTINEL });

    expect(bodies[0]).toEqual({ password: PASSWORD_SENTINEL });
    expect(result).not.toContain(PASSWORD_SENTINEL);
  });

  it("has no email parameter at all (email is immutable)", () => {
    expect(updateRunUserConfigJSON.parameters).not.toHaveProperty("email");
    expect(updateRunUserConfigJSON.description).toMatch(/immutable|permanent|cannot be changed/i);
  });

  it("rejects an update with zero editable fields without traffic", async () => {
    const bodies = captureBodies("put", `${API}/run/users/:userID`, "Successfully Updated");

    await expect(invokeTool(updateRunUserConfigJSON, makeContext(), { run_user_id: RUN_USER_ID })).rejects.toThrow(/at least one field/);
    expect(bodies).toHaveLength(0);
  });

  it("returns a controlled confirmation, not raw SDK text", async () => {
    captureBodies("put", `${API}/run/users/:userID`, "sdk-ack-sentinel Successfully Updated");

    const result = await invokeTool(updateRunUserConfigJSON, makeContext(), { run_user_id: RUN_USER_ID, name: "Renamed" });

    expect(result).toContain(RUN_USER_ID);
    expect(result).not.toContain("sdk-ack-sentinel");
  });

  it("redacts the password from a reflected failure", async () => {
    mockServer.use(http.put(`${API}/run/users/:userID`, () => HttpResponse.json({ status: false, message: `rejected '${PASSWORD_SENTINEL}'` }, { status: 400 })));

    const error = await invokeTool(updateRunUserConfigJSON, makeContext(), { run_user_id: RUN_USER_ID, password: PASSWORD_SENTINEL }).catch((caught) => caught as Error);

    expect((error as Error).message).not.toContain(PASSWORD_SENTINEL);
  });
});

describe("delete_run_user", () => {
  it("sends DELETE to the run-user path and reports token cascade", async () => {
    const deleted: string[] = [];
    mockServer.use(
      http.delete(`${API}/run/users/:userID`, ({ params }) => {
        deleted.push(params.userID as string);
        return ok("Successfully Removed");
      })
    );

    const result = await deleteRunUserConfigJSON.tool(makeContext(), { run_user_id: RUN_USER_ID });

    expect(deleted).toEqual([RUN_USER_ID]);
    expect(result).toContain(RUN_USER_ID);
    expect(result).toMatch(/token/i);
  });
});

describe("read_run_user_notifications", () => {
  it("lists notifications for the user", async () => {
    const result = await readRunUserNotificationsConfigJSON.tool(makeContext(), { run_user_id: RUN_USER_ID });

    expect(result).toContain("Report ready");
    expect(result).toContain(NOTIFICATION_ID);
  });
});

describe("send_run_user_notification", () => {
  it("posts run_user + title + message and returns the notification ID", async () => {
    const bodies = captureBodies("post", `${API}/run/notification/`, { id: NOTIFICATION_ID });

    const result = await sendRunUserNotificationConfigJSON.tool(makeContext(), { run_user_id: RUN_USER_ID, title: "Report ready", message: "Available now." });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ run_user: RUN_USER_ID, title: "Report ready", message: "Available now." });
    expect(result).toContain(NOTIFICATION_ID);
  });
});

describe("update_run_user_notification", () => {
  it("sends only the changed fields", async () => {
    const bodies = captureBodies("put", `${API}/run/notification/:notificationID`, "Successfully Updated");

    await invokeTool(updateRunUserNotificationConfigJSON, makeContext(), { notification_id: NOTIFICATION_ID, title: "Updated" });

    expect(bodies[0]).toEqual({ title: "Updated" });
  });

  it("rejects an empty update before any request", async () => {
    const bodies = captureBodies("put", `${API}/run/notification/:notificationID`, "Successfully Updated");

    await expect(invokeTool(updateRunUserNotificationConfigJSON, makeContext(), { notification_id: NOTIFICATION_ID })).rejects.toThrow(/at least one field/);
    expect(bodies).toHaveLength(0);
  });
});

describe("delete_run_user_notification", () => {
  it("sends DELETE to the notification path", async () => {
    const deleted: string[] = [];
    mockServer.use(
      http.delete(`${API}/run/notification/:notificationID`, ({ params }) => {
        deleted.push(params.notificationID as string);
        return ok("Successfully Removed");
      })
    );

    const result = await deleteRunUserNotificationConfigJSON.tool(makeContext(), { notification_id: NOTIFICATION_ID });

    expect(deleted).toEqual([NOTIFICATION_ID]);
    expect(result).toContain(NOTIFICATION_ID);
  });
});

describe("login_as_run_user expiry clamp", () => {
  it.each(["never", "NEVER", "Never"])("rejects the non-expiring literal %j before any request", async (value) => {
    const context = makeContext();
    await expect(loginAsRunUserConfigJSON.tool(context, { run_user_id: RUN_USER_ID, expire_time: value })).rejects.toThrow(/never|revoked|revoke/i);
  });

  it("rejects a duration above the 2-hour ceiling", async () => {
    await expect(loginAsRunUserConfigJSON.tool(makeContext(), { run_user_id: RUN_USER_ID, expire_time: "3 hours" })).rejects.toThrow(/ceiling|2-hour|hours/i);
  });

  it.each(["2 days", "1 month", "1 year", "forever", "soon", "90"])("rejects the unparseable/too-coarse duration %j", async (value) => {
    await expect(loginAsRunUserConfigJSON.tool(makeContext(), { run_user_id: RUN_USER_ID, expire_time: value })).rejects.toThrow();
  });

  it("accepts 2 hours (the ceiling) and 90 minutes and sends them on the wire", async () => {
    const queries: string[] = [];
    mockServer.use(
      http.get(`${API}/run/users/:userID/login`, ({ request }) => {
        queries.push(new URL(request.url).searchParams.get("expire_time") ?? "");
        return ok(fixtures.runUserLoginResponse);
      })
    );

    await loginAsRunUserConfigJSON.tool(makeContext(), { run_user_id: RUN_USER_ID, expire_time: "2 hours" });
    await loginAsRunUserConfigJSON.tool(makeContext(), { run_user_id: RUN_USER_ID, expire_time: "90 minutes" });

    expect(queries).toEqual(["2 hours", "90 minutes"]);
  });

  it("defaults to 1 hour when expire_time is omitted", async () => {
    const queries: string[] = [];
    mockServer.use(
      http.get(`${API}/run/users/:userID/login`, ({ request }) => {
        queries.push(new URL(request.url).searchParams.get("expire_time") ?? "");
        return ok(fixtures.runUserLoginResponse);
      })
    );

    await loginAsRunUserConfigJSON.tool(makeContext(), { run_user_id: RUN_USER_ID });

    expect(queries).toEqual(["1 hour"]);
  });

  it("clampExpireTime normalizes and enforces the ceiling", () => {
    expect(clampExpireTime(undefined)).toBe("1 hour");
    expect(clampExpireTime("2 HOURS")).toBe("2 hours");
    expect(clampExpireTime("120 minutes")).toBe("120 minutes");
    expect(() => clampExpireTime("never")).toThrow();
    expect(() => clampExpireTime("121 minutes")).toThrow();
    expect(() => clampExpireTime("3 hours")).toThrow();
    expect(() => clampExpireTime("0 minutes")).toThrow();
    expect(() => clampExpireTime("2 days")).toThrow();
  });
});

describe("login_as_run_user token boundary", () => {
  it("returns the minted token labeled as a live credential with revocation guidance", async () => {
    const result = await loginAsRunUserConfigJSON.tool(makeContext(), { run_user_id: RUN_USER_ID, expire_time: "1 hour" });

    expect(result).toContain(fixtures.FAKE_RUN_USER_LOGIN_TOKEN);
    expect(result).toMatch(/live credential/i);
    expect(result).toMatch(/deactivate|delete/i);
    // Reads expire_time (server key) not the SDK's declared expire_date.
    expect(result).toContain("2026-01-01T01:00:00.000Z");
    // The response `name` is the minted token's label, not the run user's
    // display name; it renders as token_name and never as the user.
    expect(result).toContain("token_name: Login by Run Administrator(admin@example.com)");
    expect(result).not.toContain("run user `Login by Run Administrator");
  });

  it("keeps the minted token out of thrown errors", async () => {
    mockServer.use(http.get(`${API}/run/users/:userID/login`, () => HttpResponse.json({ status: false, message: `login denied for ${REQUEST_TOKEN}` }, { status: 403 })));

    const error = await loginAsRunUserConfigJSON.tool(makeContext(), { run_user_id: RUN_USER_ID, expire_time: "1 hour" }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(REQUEST_TOKEN);
    expect((error as Error).message).not.toContain(fixtures.FAKE_RUN_USER_LOGIN_TOKEN);
  });

  it("reads expire_date defensively when the server returns that key instead", async () => {
    mockServer.use(
      http.get(`${API}/run/users/:userID/login`, () =>
        ok({ token: fixtures.FAKE_RUN_USER_LOGIN_TOKEN, name: "Login by Run Administrator(admin@example.com)", run_user: RUN_USER_ID, expire_date: "2026-02-02T02:00:00.000Z" })
      )
    );

    const result = await loginAsRunUserConfigJSON.tool(makeContext(), { run_user_id: RUN_USER_ID });

    expect(result).toContain("2026-02-02T02:00:00.000Z");
  });
});
