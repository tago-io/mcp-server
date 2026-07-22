import { Resources } from "@tago-io/sdk";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { makeTestContext, TEST_REGION } from "../../../../testing/context";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { validateWidgetConfigurationConfigJSON } from "../validate-widget-configuration";

const REQUEST_TOKEN = "a-0000000000000000000000000000000000";
// Token-shaped sentinel: must never appear in success or error output.
const SENTINEL = "p-feedfacefeedfacefeedfacefeedface1234";

const VALID_GAUGE = { label: SENTINEL, type: "gauge", display: { gauge_type: "solid", numberformat: "0", minimum: 0, maximum: 100 } };

function makeContext() {
  const resources = new Resources({ token: REQUEST_TOKEN, region: TEST_REGION });
  return makeTestContext({ resources, token: REQUEST_TOKEN });
}

// No handlers are registered: strict mode fails the test on ANY outbound request.
beforeAll(() => mockServer.listen(strictListenOptions));
afterEach(() => {
  mockServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => mockServer.close());

describe("validate_widget_configuration", () => {
  it("confirms a valid create candidate with a short local message, firing no network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await validateWidgetConfigurationConfigJSON.tool(makeContext(), { configuration: VALID_GAUGE });

    expect(result).toContain('"gauge"');
    expect(result).toContain("create schema");
    expect(result).toContain("no request was sent");
    expect(result).not.toContain(SENTINEL);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("validates the full candidate against the update schema when mode is update", async () => {
    const result = await validateWidgetConfigurationConfigJSON.tool(makeContext(), { configuration: VALID_GAUGE, mode: "update" });

    expect(result).toContain('"gauge"');
    expect(result).toContain("update schema");
  });

  it("accepts a bundled iframe widget's fetched state in update mode (bundler-managed artifact_url tolerated)", async () => {
    const bundled = {
      type: "iframe",
      label: "Custom metric",
      display: { url: "https://files.example.test/prof/storage/widgets/w.tsx", artifact_url: "https://files.example.test/prof/storage/widgets/.bundled/w/h.html" },
    };

    const result = await validateWidgetConfigurationConfigJSON.tool(makeContext(), { configuration: bundled, mode: "update" });

    expect(result).toContain('"iframe"');
    expect(result).toContain("update schema");
  });

  it("still rejects display.artifact_url on a create candidate; the key is bundler-managed, not caller-writable", async () => {
    const candidate = { type: "iframe", label: "Custom metric", display: { url: "", artifact_url: "https://files.example.test/x.html" } };

    const error = await validateWidgetConfigurationConfigJSON.tool(makeContext(), { configuration: candidate }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("artifact_url");
  });

  it("rejects an invalid candidate with exact nested issue paths and schema steering, without echoing the candidate", async () => {
    const error = await validateWidgetConfigurationConfigJSON.tool(makeContext(), { configuration: { label: SENTINEL, type: "gauge" } }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("- `display`");
    expect((error as Error).message).toContain("widget_schema_lookup");
    expect((error as Error).message).not.toContain(SENTINEL);
  });

  it("reports nested paths for deep display violations", async () => {
    const error = await validateWidgetConfigurationConfigJSON
      .tool(makeContext(), { configuration: { ...VALID_GAUGE, label: "Tank", display: { ...VALID_GAUGE.display, gauge_type: "bogus" } } })
      .catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("display.gauge_type");
  });

  it("rejects a missing type with an actionable error steering to widget_schema_lookup", async () => {
    const error = await validateWidgetConfigurationConfigJSON.tool(makeContext(), { configuration: { label: "No Type" } }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("configuration.type");
    expect((error as Error).message).toContain("widget_schema_lookup");
  });

  it("rejects an unknown type, listing supported types and steering to widget_schema_lookup", async () => {
    const error = await validateWidgetConfigurationConfigJSON.tool(makeContext(), { configuration: { type: "not-a-widget" } }).catch((caught) => caught as Error);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("not-a-widget");
    expect((error as Error).message).toContain("widget_schema_lookup");
  });
});
