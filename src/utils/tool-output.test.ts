import { describe, expect, it } from "vitest";

import { invalidParamError } from "./tool-errors";
import { renderItem, renderList } from "./tool-output";

const items = [
  { id: "1", name: "Sensor A", type: "mutable", secretish: "full-field" },
  { id: "2", name: "Sensor B", type: "immutable", secretish: "full-field" },
];

describe("renderList", () => {
  it("keeps only concise fields by default", () => {
    const output = renderList({ items, conciseFields: ["id", "name"], requestedAmount: 20, resourceLabel: "devices" });
    expect(output).toContain("Sensor A");
    expect(output).not.toContain("full-field");
    expect(output).toContain("2 devices");
    expect(output).toContain('response_format: "detailed"');
  });

  it("renders exactly the selected fields in concise mode, even outside the concise defaults", () => {
    const output = renderList({ items, conciseFields: ["id", "name"], selectedFields: ["id", "secretish"], requestedAmount: 20, resourceLabel: "devices" });
    expect(output).toContain("full-field");
    expect(output).not.toContain("Sensor A");
  });

  it("ignores an empty selection and falls back to the concise defaults", () => {
    const output = renderList({ items, conciseFields: ["id", "name"], selectedFields: [], requestedAmount: 20, resourceLabel: "devices" });
    expect(output).toContain("Sensor A");
    expect(output).not.toContain("full-field");
  });

  it("keeps detailed mode rendering everything regardless of the selection", () => {
    const output = renderList({ items, conciseFields: ["id"], selectedFields: ["id"], responseFormat: "detailed", requestedAmount: 20, resourceLabel: "devices" });
    expect(output).toContain("full-field");
    expect(output).toContain("Sensor A");
  });

  it("returns every field in detailed mode", () => {
    const output = renderList({ items, conciseFields: ["id"], responseFormat: "detailed", requestedAmount: 20, resourceLabel: "devices" });
    expect(output).toContain("full-field");
  });

  it("adds a truncation steer when the page is full", () => {
    const output = renderList({ items, conciseFields: ["id"], requestedAmount: 2, page: 1, resourceLabel: "devices" });
    expect(output).toContain("request page 2");
  });

  it("returns an actionable empty message", () => {
    const output = renderList({ items: [], conciseFields: ["id"], requestedAmount: 20, resourceLabel: "devices", emptyHint: "Try a broader name." });
    expect(output).toBe("No devices found. Try a broader name.");
  });
});

describe("renderItem", () => {
  it("renders concise fields with a steer by default", () => {
    const output = renderItem(items[0], ["id", "name"]);
    expect(output).toContain("Sensor A");
    expect(output).not.toContain("full-field");
    expect(output).toContain('response_format: "detailed"');
  });

  it("renders everything in detailed mode", () => {
    const output = renderItem(items[0], ["id"], "detailed");
    expect(output).toContain("full-field");
  });
});

describe("invalidParamError", () => {
  it("names the parameter, constraint, and a valid example", () => {
    const error = invalidParamError("device_id", "must be a 24-character ID", '"61f0000000000000000d0001"');
    expect(error.message).toBe('Invalid `device_id`: must be a 24-character ID. Valid example: "61f0000000000000000d0001"');
  });
});
