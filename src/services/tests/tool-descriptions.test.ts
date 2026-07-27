import { describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { actionTools } from "../actions/tools/index";
import { analysisTools } from "../analysis/tools/index";
import { deviceTools } from "../devices/tools/index";
import { docsTools } from "../docs/tools/index";
import { documentationTools } from "../documentation/tools/index";
import { entityTools } from "../entities/tools/index";
import { integrationTools } from "../integration/tools/index";
import { profileMetricsTools } from "../profile/tools/index";
import { userTools } from "../run-users/tools/index";

const allTools = [...actionTools, ...analysisTools, ...deviceTools, ...docsTools, ...documentationTools, ...entityTools, ...integrationTools, ...profileMetricsTools, ...userTools];

function extractExamples(description: string): string[] {
  const matches = description.matchAll(/<example>([\s\S]*?)<\/example>/g);
  return Array.from(matches, (match) => match[1].trim());
}

describe("tool descriptions", () => {
  it("registers a unique name for every tool", () => {
    const names = allTools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  // Regression: the device-delete-data example shipped with a missing
  // closing quote, so the only usage example agents saw was unparseable.
  it("every <example> block is valid JSON", () => {
    for (const tool of allTools) {
      for (const example of extractExamples(tool.description)) {
        expect(() => JSON.parse(example), `invalid example JSON in tool "${tool.name}"`).not.toThrow();
      }
    }
  });

  it("every <example> block validates against the tool's own input schema", () => {
    for (const tool of allTools) {
      for (const example of extractExamples(tool.description)) {
        const parsed = JSON.parse(example);
        const result = z.object(tool.parameters).safeParse(parsed);
        expect(result.success, `example for tool "${tool.name}" fails its own schema: ${result.success ? "" : result.error.message}`).toBe(true);
      }
    }
  });

  // Regression: descriptions used to interpolate new Date() at module
  // load, making tool definitions differ between server restarts (stale dates
  // for long-lived processes and cache-busting on HTTP/Lambda).
  it("no description embeds a load-time date", () => {
    const today = new Date();
    const datePatterns = [today.toLocaleDateString(), today.toLocaleDateString("en-US"), today.toISOString().slice(0, 10), "current date/time reference", "Current Date:"];

    for (const tool of allTools) {
      for (const pattern of datePatterns) {
        expect(tool.description.includes(pattern), `tool "${tool.name}" embeds "${pattern}"`).toBe(false);
      }
    }
  });
});
