import { describe, it, expect } from "vitest";
import { toMarkdown } from "./markdown";
import { ActionInfo } from "@tago-io/sdk/lib/types";

const actions: ActionInfo[] = [
  {
    id: "123",
    active: false,
    name: "test 1",
    description: null,
    created_at: new Date("2024-12-11T13:39:03.467Z"),
    updated_at: new Date("2025-02-28T13:52:29.919Z"),
    last_triggered: new Date("2024-12-11T13:45:40.604Z"),
    tags: [{ key: "blah", value: "test_1" }],
    type: "interval",
    action: { type: "script", script: ["analysis-id"] },
  },
  {
    id: "321",
    active: true,
    name: "Test MQTT",
    description: null,
    created_at: new Date("2024-02-08T19:32:10.727Z"),
    updated_at: new Date("2024-02-08T20:01:01.742Z"),
    last_triggered: new Date("2025-03-24T17:25:14.822Z"),
    tags: [],
    type: "mqtt_topic",
    action: { type: "script", script: ["analysis-id"] },
  },
];

describe("toMarkdown", () => {
  it("should convert an array of actions to a Markdown table", () => {
    const md = toMarkdown(actions);
    expect(md).toContain("| id | active | name | description | created_at | updated_at | last_triggered | tags | type | action |");
    expect(md).toContain("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    expect(md).toContain(
      '| 123 | false | test 1 | _empty_ | `"2024-12-11T13:39:03.467Z"` | `"2025-02-28T13:52:29.919Z"` | `"2024-12-11T13:45:40.604Z"` | `[{"key":"blah","value":"test_1"}]` | interval | `{"type":"script","script":["analysis-id"]}` |'
    );
    expect(md).toContain(
      '| 321 | true | Test MQTT | _empty_ | `"2024-02-08T19:32:10.727Z"` | `"2024-02-08T20:01:01.742Z"` | `"2025-03-24T17:25:14.822Z"` | [] | mqtt_topic | `{"type":"script","script":["analysis-id"]}` |'
    );
    expect(md).toContain("interval");
    expect(md).toContain("mqtt_topic");
    expect(md).toContain("tags");
  });

  it("should handle an empty array", () => {
    expect(toMarkdown([])).toBe("_No data found._");
  });

  it("should convert a simple object to a Markdown list", () => {
    const obj = { foo: "bar", num: 42 };
    const md = toMarkdown(obj);
    expect(md).toContain("- **foo**: bar");
    expect(md).toContain("- **num**: 42");
  });

  it("should convert a primitive to string", () => {
    expect(toMarkdown(123)).toBe("123");
    expect(toMarkdown(true)).toBe("true");
    expect(toMarkdown(null)).toBe("_empty_");
    expect(toMarkdown(undefined)).toBe("_empty_");
  });
});
