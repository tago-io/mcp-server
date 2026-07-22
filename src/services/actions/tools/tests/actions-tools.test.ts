import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

import { makeTestContext } from "../../../../testing/context";
import { invokeTool } from "../../../../testing/invoke-tool";
import { createActionConfigJSON } from "../create-action";
import { deleteActionConfigJSON } from "../delete-action";
import { getActionConfigJSON } from "../get-action";
import { actionTools } from "../index";
import { searchActionsConfigJSON } from "../search-actions";
import { updateActionConfigJSON } from "../update-action";

const VALID_ID = "6299f0b1c72f2f00181d8b3c";

function extractExamples(description: string): string[] {
  const matches = description.matchAll(/<example>([\s\S]*?)<\/example>/g);
  return Array.from(matches, (match) => match[1].trim());
}

describe("action tool descriptions", () => {
  it("every tool's <example> validates against its own schema", () => {
    for (const tool of actionTools) {
      const examples = extractExamples(tool.description);
      expect(examples.length, `tool "${tool.name}" has no <example> block`).toBeGreaterThan(0);
      for (const example of examples) {
        const result = z.object(tool.parameters).safeParse(JSON.parse(example));
        expect(result.success, `example for tool "${tool.name}" fails its own schema: ${result.success ? "" : result.error.message}`).toBe(true);
      }
    }
  });
});

describe("search_actions", () => {
  it("wraps the name filter in wildcards once and keeps other filters intact", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { actions: { list } } });

    await searchActionsConfigJSON.tool(context, {
      filter: { name: "notification", active: true, tags: [{ key: "action_type", value: "alert" }] },
      amount: 5,
      page: 2,
    });

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5,
        page: 2,
        filter: {
          name: "*notification*",
          active: true,
          tags: [{ key: "action_type", value: "alert" }],
        },
      })
    );
  });

  it("applies default amount and fields when omitted", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { actions: { list } } });

    await searchActionsConfigJSON.tool(context, {});

    expect(list).toHaveBeenCalledWith({
      amount: 20,
      fields: ["id", "active", "name", "created_at", "updated_at", "last_triggered", "tags", "type", "action"],
    });
  });

  it("lifts a valid filter.orderBy to the SDK query and rejects malformed values", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { actions: { list } } });

    await searchActionsConfigJSON.tool(context, { filter: { orderBy: "name,desc" } });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ orderBy: ["name", "desc"], filter: {} }));

    await expect(searchActionsConfigJSON.tool(context, { filter: { orderBy: "bogus" } })).rejects.toThrow(/orderBy/);
  });

  it("caps amount at 200 in the schema", () => {
    const schema = z.object(searchActionsConfigJSON.parameters);
    expect(schema.safeParse({ amount: 200 }).success).toBe(true);
    expect(schema.safeParse({ amount: 201 }).success).toBe(false);
  });
});

describe("action_id validation", () => {
  const idCases = [
    { tool: getActionConfigJSON, extra: {} },
    { tool: updateActionConfigJSON, extra: { name: "New name" } },
    { tool: deleteActionConfigJSON, extra: {} },
  ];

  it.each(idCases)("$tool.name requires a 24-character action_id", ({ tool, extra }) => {
    const schema = z.object(tool.parameters);
    expect(schema.safeParse({ action_id: VALID_ID, ...extra }).success).toBe(true);
    expect(schema.safeParse({ action_id: "too-short", ...extra }).success).toBe(false);
    expect(schema.safeParse({ ...extra }).success).toBe(false);
  });
});

// One entry per SDK ActionTypeParams variant; `missing` is a required field per the SDK type.
const actionVariants = [
  { action: { type: "script", script: [VALID_ID] }, missing: "script" },
  { action: { type: "notification", message: "Hi", subject: "Alert" }, missing: "subject" },
  { action: { type: "notification_run", message: "Hi", subject: "Alert", run_user: VALID_ID }, missing: "run_user" },
  { action: { type: "email", message: "Hi", subject: "Alert", to: "ops@example.com" }, missing: "to" },
  { action: { type: "sms", message: "Hi", to: "+15550001111" }, missing: "to" },
  { action: { type: "mqtt", bucket: VALID_ID, payload: "{}", topic: "alerts" }, missing: "topic" },
  { action: { type: "post", url: "https://api.example.com/webhook", headers: { "content-type": "application/json" } }, missing: "headers" },
  {
    action: { type: "sms-twilio", message: "Hi", to: "+15550001111", from: "+15550002222", twilio_sid: VALID_ID, twilio_token: VALID_ID },
    missing: "twilio_token",
  },
  {
    action: {
      type: "whatsapp-twilio",
      message: "Hi",
      to: "+15550001111",
      from: "+15550002222",
      content_sid: VALID_ID,
      twilio_sid: VALID_ID,
      twilio_token: VALID_ID,
      content_variables: [{ name: "1", value: "30" }],
    },
    missing: "message",
  },
  {
    action: { type: "email-sendgrid", message: "Hi", subject: "Alert", to: "ops@example.com", from: "noreply@example.com", sendgrid_api_key: VALID_ID },
    missing: "sendgrid_api_key",
  },
  {
    action: { type: "email-smtp", message: "Hi", subject: "Alert", to: "ops@example.com", from: "noreply@example.com", smtp_secret: VALID_ID },
    missing: "smtp_secret",
  },
  { action: { type: "queue-sqs", sqs_secret: VALID_ID, batch_enabled: false }, missing: "batch_enabled" },
];

describe("create_action discriminated union", () => {
  const createSchema = z.object(createActionConfigJSON.parameters);
  const base = { name: "Test Action", type: "interval", trigger: [{ interval: "5 minutes" }] };

  it.each(actionVariants)("accepts the $action.type action payload and forwards the exact action object to the SDK", async ({ action }) => {
    const create = vi.fn().mockResolvedValue({ action: VALID_ID });
    const context = makeTestContext({ resources: { actions: { create } } });

    await invokeTool(createActionConfigJSON, context, { ...base, action });

    expect(create).toHaveBeenCalledWith({
      name: "Test Action",
      type: "interval",
      trigger: [{ interval: "5 minutes" }],
      action,
    });
  });

  it.each(actionVariants)("rejects the $action.type variant when $missing is missing", ({ action, missing }) => {
    const { [missing]: _omitted, ...incomplete } = action as Record<string, unknown>;
    const result = createSchema.safeParse({ ...base, action: incomplete });
    expect(result.success).toBe(false);
  });

  it("rejects whatsapp-twilio without content_variables", () => {
    const whatsapp = actionVariants.find(({ action }) => action.type === "whatsapp-twilio")!;
    const { content_variables: _omitted, ...incomplete } = whatsapp.action as Record<string, unknown>;
    expect(createSchema.safeParse({ ...base, action: incomplete }).success).toBe(false);
  });

  it("calls resources.actions.create and returns the new action ID", async () => {
    const create = vi.fn().mockResolvedValue({ action: VALID_ID });
    const context = makeTestContext({ resources: { actions: { create } } });

    const output = await invokeTool(createActionConfigJSON, context, {
      name: "Test Action",
      type: "resource",
      action: { type: "script", script: [VALID_ID] },
      trigger: [{ resource: "device", when: "create", tag_key: "device_type", tag_value: "sensor" }],
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "Test Action", type: "resource" }));
    expect(output).toContain(VALID_ID);
  });

  it("exposes `active` and forwards it to the SDK", async () => {
    const create = vi.fn().mockResolvedValue({ action: VALID_ID });
    const context = makeTestContext({ resources: { actions: { create } } });

    await invokeTool(createActionConfigJSON, context, { ...base, action: { type: "sms", message: "Hi", to: "+15550001111" }, active: false });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
  });
});

describe("condition trigger operators", () => {
  const createSchema = z.object(createActionConfigJSON.parameters);
  const notification = { type: "notification", message: "Hi", subject: "Alert" };

  it.each(["<", ">", "=", "!", "><", "*"])("accepts the SDK Conditionals operator %s", (is) => {
    const trigger = [{ device: VALID_ID, variable: "temperature", is, value: "30", value_type: "number", ...(is === "><" && { second_value: "40" }) }];
    const result = createSchema.safeParse({ name: "Cond", type: "condition", action: notification, trigger });
    expect(result.success, result.success ? "" : result.error.message).toBe(true);
  });

  it("rejects an unsupported operator", () => {
    const trigger = [{ device: VALID_ID, variable: "temperature", is: ">=", value: "30", value_type: "number" }];
    expect(createSchema.safeParse({ name: "Cond", type: "condition", action: notification, trigger }).success).toBe(false);
  });
});

describe("create_action trigger/type coherence", () => {
  const notification = { type: "notification", message: "Hi", subject: "Alert" };

  const validTriggersByType = [
    { type: "resource", trigger: [{ resource: "device", when: "create", tag_key: "device_type", tag_value: "sensor" }] },
    { type: "interval", trigger: [{ interval: "5 minutes" }] },
    { type: "schedule", trigger: [{ cron: "0 8 * * *", timezone: "America/New_York" }] },
    { type: "condition", trigger: [{ device: VALID_ID, variable: "temperature", is: ">", value: "30", value_type: "number" }] },
    { type: "usage_alert", trigger: [{ service_or_resource: "input", condition: ">", condition_value: 100000 }] },
    {
      type: "condition_geofence",
      trigger: [{ device: VALID_ID, variable: "location", is: "IN", value: { center: [-97.7, 30.3], radius: 5 } }],
    },
  ];

  it.each(validTriggersByType)("accepts a matching trigger for the $type type", async ({ type, trigger }) => {
    const create = vi.fn().mockResolvedValue({ action: VALID_ID });
    const context = makeTestContext({ resources: { actions: { create } } });

    await invokeTool(createActionConfigJSON, context, { name: "Test Action", type, action: notification, trigger });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type, trigger }));
  });

  it("accepts mqtt_topic with the topic carried in the mqtt action object and no trigger", async () => {
    const create = vi.fn().mockResolvedValue({ action: VALID_ID });
    const context = makeTestContext({ resources: { actions: { create } } });

    await invokeTool(createActionConfigJSON, context, {
      name: "MQTT relay",
      type: "mqtt_topic",
      action: { type: "mqtt", bucket: VALID_ID, payload: "{}", topic: "sensors/+" },
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: "mqtt_topic" }));
  });

  it("rejects a trigger that does not match the top-level type before calling the SDK", async () => {
    const create = vi.fn();
    const context = makeTestContext({ resources: { actions: { create } } });

    await expect(
      invokeTool(createActionConfigJSON, context, {
        name: "Mismatch",
        type: "interval",
        action: notification,
        trigger: [{ resource: "device", when: "create", tag_key: "device_type", tag_value: "sensor" }],
      })
    ).rejects.toThrow(/trigger/);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a trigger array on mqtt_topic actions before calling the SDK", async () => {
    const create = vi.fn();
    const context = makeTestContext({ resources: { actions: { create } } });

    await expect(
      invokeTool(createActionConfigJSON, context, {
        name: "MQTT relay",
        type: "mqtt_topic",
        action: { type: "mqtt", bucket: VALID_ID, payload: "{}", topic: "sensors/+" },
        trigger: [{ interval: "5 minutes" }],
      })
    ).rejects.toThrow(/trigger/);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("update_action", () => {
  it("passes only the provided fields to resources.actions.edit", async () => {
    const edit = vi.fn().mockResolvedValue("Successfully Updated");
    const context = makeTestContext({ resources: { actions: { edit } } });

    await invokeTool(updateActionConfigJSON, context, { action_id: VALID_ID, name: "Renamed" });

    expect(edit).toHaveBeenCalledWith(VALID_ID, { name: "Renamed" });
  });

  it("returns a controlled confirmation, never the raw SDK acknowledgment", async () => {
    // Action definitions can carry sensitive submitted content (e.g. POST
    // headers) that the SDK success response may reflect.
    const submittedName = "Renamed with sensitive-submitted-sentinel";
    const edit = vi.fn().mockResolvedValue(`Successfully Updated: ${submittedName} sdk-ack-sentinel`);
    const context = makeTestContext({ resources: { actions: { edit } } });

    const result = await invokeTool(updateActionConfigJSON, context, { action_id: VALID_ID, name: submittedName });

    expect(result).toContain(VALID_ID);
    expect(result).toMatch(/updated/i);
    expect(result).not.toContain("sdk-ack-sentinel");
    expect(result).not.toContain("Successfully Updated");
  });

  it("allows a scalar-only change of active alone", async () => {
    const edit = vi.fn().mockResolvedValue("Successfully Updated");
    const context = makeTestContext({ resources: { actions: { edit } } });

    await invokeTool(updateActionConfigJSON, context, { action_id: VALID_ID, active: false });

    expect(edit).toHaveBeenCalledWith(VALID_ID, { active: false });
  });

  it("rejects a trigger without its type before calling the SDK", async () => {
    const edit = vi.fn();
    const context = makeTestContext({ resources: { actions: { edit } } });

    await expect(invokeTool(updateActionConfigJSON, context, { action_id: VALID_ID, trigger: [{ interval: "5 minutes" }] })).rejects.toThrow(/type/);
    expect(edit).not.toHaveBeenCalled();
  });

  it("rejects a type change without the replacement trigger before calling the SDK", async () => {
    const edit = vi.fn();
    const context = makeTestContext({ resources: { actions: { edit } } });

    await expect(invokeTool(updateActionConfigJSON, context, { action_id: VALID_ID, type: "interval" })).rejects.toThrow(/trigger/);
    expect(edit).not.toHaveBeenCalled();
  });

  it("accepts a coherent type + trigger replacement", async () => {
    const edit = vi.fn().mockResolvedValue("Successfully Updated");
    const context = makeTestContext({ resources: { actions: { edit } } });

    await invokeTool(updateActionConfigJSON, context, { action_id: VALID_ID, type: "interval", trigger: [{ interval: "5 minutes" }] });

    expect(edit).toHaveBeenCalledWith(VALID_ID, { type: "interval", trigger: [{ interval: "5 minutes" }] });
  });

  it("rejects a mismatched type + trigger replacement before calling the SDK", async () => {
    const edit = vi.fn();
    const context = makeTestContext({ resources: { actions: { edit } } });

    await expect(
      invokeTool(updateActionConfigJSON, context, {
        action_id: VALID_ID,
        type: "schedule",
        trigger: [{ interval: "5 minutes" }],
      })
    ).rejects.toThrow(/trigger/);
    expect(edit).not.toHaveBeenCalled();
  });

  it("rejects an update with no fields to change", async () => {
    const edit = vi.fn();
    const context = makeTestContext({ resources: { actions: { edit } } });

    await expect(invokeTool(updateActionConfigJSON, context, { action_id: VALID_ID })).rejects.toThrow(/at least one field/);
    expect(edit).not.toHaveBeenCalled();
  });
});

describe("delete_action", () => {
  it("calls resources.actions.delete with the action_id", async () => {
    const del = vi.fn().mockResolvedValue("Successfully Removed");
    const context = makeTestContext({ resources: { actions: { delete: del } } });

    const output = await deleteActionConfigJSON.tool(context, { action_id: VALID_ID });

    expect(del).toHaveBeenCalledWith(VALID_ID);
    expect(output).toContain(VALID_ID);
  });
});
