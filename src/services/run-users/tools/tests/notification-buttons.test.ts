import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Resources } from "@tago-io/sdk";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../../../../server/build-server";
import { TEST_REGION } from "../../../../testing/context";
import { API } from "../../../../testing/mocks/handlers";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";

/**
 * Notification buttons and icons exercised through a real MCP client/server
 * pair: the strict input schema and the cross-field rules only run at this
 * boundary, so handler-level calls cannot prove what a client may send.
 */

const TOKEN = "a-0000000000000000000000000000000000";
const RUN_USER_ID = fixtures.IDS.user;
const NOTIFICATION_ID = fixtures.IDS.notification;
const ANALYSIS_ID = fixtures.IDS.analysis;

const BASE_SEND = { run_user_id: RUN_USER_ID, title: "High temperature", message: "Freezer 2 is above 30 °C." };
const ANALYSIS_BUTTON = { id: "ack", label: "Acknowledge", triggers: [{ analysis_id: ANALYSIS_ID }] };

async function callTool(name: string, args: Record<string, unknown>) {
  const resources = new Resources({ token: TOKEN, region: TEST_REGION });
  const server = buildServer({ resources, token: TOKEN, region: TEST_REGION, credentialKind: "analysis" });
  const client = new Client({ name: "notification-buttons-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ text: string }>).map((entry) => entry.text).join("\n");
    return { isError: result.isError === true, text };
  } finally {
    await client.close();
    await server.close();
  }
}

function captureNotificationBodies() {
  const bodies: Array<Record<string, unknown>> = [];
  const record = async ({ request }: { request: Request }) => {
    bodies.push((await request.json()) as Record<string, unknown>);
  };
  mockServer.use(
    http.post(`${API}/run/notification/`, async (info) => {
      await record(info);
      return HttpResponse.json({ status: true, result: { id: NOTIFICATION_ID } });
    }),
    http.put(`${API}/run/notification/:notificationID`, async (info) => {
      await record(info);
      return HttpResponse.json({ status: true, result: "Successfully Updated" });
    })
  );
  return bodies;
}

beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("send_run_user_notification buttons and icon", () => {
  it("sends every trigger kind and an image icon, defaulting an analysis trigger scope to []", async () => {
    const bodies = captureNotificationBodies();
    const buttons = [
      ANALYSIS_BUTTON,
      { id: "page", label: "Open dashboard", triggers: [{ url: "/dashboards/info/61f0000000000000000da001", method: "REDIRECT" }] },
      { id: "link", label: "Manual", color: "#337ab7", triggers: [{ url: "https://example.com/freezer-2", method: "REDIRECT" }] },
      { id: "hook", label: "Notify team", triggers: [{ url: "https://example.com/hook", method: "POST", body: { freezer: 2 } }] },
    ];
    const icon = { image_url: "https://example.com/freezer.png", bg_color: "#ffffff", fit: "contain" };

    const result = await callTool("send_run_user_notification", { ...BASE_SEND, buttons, buttons_enabled: true, buttons_autodisable: false, icon });

    expect(result.isError, result.text).toBe(false);
    expect(bodies).toEqual([
      {
        run_user: RUN_USER_ID,
        title: BASE_SEND.title,
        message: BASE_SEND.message,
        buttons: [{ ...ANALYSIS_BUTTON, triggers: [{ analysis_id: ANALYSIS_ID, scope: [] }] }, ...buttons.slice(1)],
        buttons_enabled: true,
        buttons_autodisable: false,
        icon,
      },
    ]);
  });

  it.each([
    ["more than four buttons", { buttons: Array.from({ length: 5 }, (_, index) => ({ ...ANALYSIS_BUTTON, id: `b${index}` })) }],
    ["a button without triggers", { buttons: [{ ...ANALYSIS_BUTTON, triggers: [] }] }],
    ["a trigger mixing analysis and URL fields", { buttons: [{ ...ANALYSIS_BUTTON, triggers: [{ analysis_id: ANALYSIS_ID, url: "https://example.com", method: "REDIRECT" }] }] }],
    ["an icon mixing SVG and image fields", { icon: { svg_url: "https://example.com/a.svg", image_url: "https://example.com/a.png" } }],
  ])("rejects %s before any request", async (_case, extra) => {
    const bodies = captureNotificationBodies();

    const result = await callTool("send_run_user_notification", { ...BASE_SEND, ...extra });

    expect(result.isError).toBe(true);
    expect(bodies).toEqual([]);
  });

  it.each(["javascript:alert(document.cookie)", " javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "//evil.example/path", "ftp://example.com/file"])(
    "rejects the unsafe button URL %j before any request",
    async (url) => {
      const bodies = captureNotificationBodies();

      const result = await callTool("send_run_user_notification", { ...BASE_SEND, buttons: [{ id: "x", label: "X", triggers: [{ url, method: "REDIRECT" }] }] });

      expect(result.isError).toBe(true);
      expect(bodies).toEqual([]);
    }
  );

  it.each([{ svg_url: "javascript:alert(1)" }, { svg_url: "http://example.com/icon.svg" }, { image_url: "javascript:alert(1)" }, { image_url: "data:image/png;base64,AAAA" }])(
    "rejects the non-https icon %j before any request",
    async (icon) => {
      const bodies = captureNotificationBodies();

      const result = await callTool("send_run_user_notification", { ...BASE_SEND, icon });

      expect(result.isError).toBe(true);
      expect(bodies).toEqual([]);
    }
  );
});

describe("update_run_user_notification buttons and icon", () => {
  it("accepts an icon-only update and sends just the icon", async () => {
    const bodies = captureNotificationBodies();
    const icon = { svg_url: "https://svg.internal.tago.io/bell.svg", svg_color: "#ff0000" };

    const result = await callTool("update_run_user_notification", { notification_id: NOTIFICATION_ID, icon });

    expect(result.isError, result.text).toBe(false);
    expect(bodies).toEqual([{ icon }]);
  });

  it("accepts an empty buttons array as a change that removes every button", async () => {
    const bodies = captureNotificationBodies();

    const result = await callTool("update_run_user_notification", { notification_id: NOTIFICATION_ID, buttons: [] });

    expect(result.isError, result.text).toBe(false);
    expect(bodies).toEqual([{ buttons: [] }]);
  });

  it("rejects an unsafe button URL on update before any request", async () => {
    const bodies = captureNotificationBodies();

    const result = await callTool("update_run_user_notification", {
      notification_id: NOTIFICATION_ID,
      buttons: [{ id: "x", label: "X", triggers: [{ url: "javascript:alert(1)", method: "REDIRECT" }] }],
    });

    expect(result.isError).toBe(true);
    expect(bodies).toEqual([]);
  });
});
