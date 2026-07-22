import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

import { makeTestContext } from "../../../../testing/context";
import { getProfileConfigJSON } from "../get-profile";
import { getProfileLimitsConfigJSON } from "../get-profile-limits";
import { getProfileStatisticsConfigJSON } from "../get-profile-statistics";
import { searchSecretsConfigJSON } from "../search-secrets";

const PROFILE_ID = "61f0000000000000000b0001";
const SECRET_ID = "61f0000000000000000c0001";

function extractExample(description: string): unknown {
  const match = description.match(/<example>([\s\S]*?)<\/example>/);
  return JSON.parse(match![1].trim());
}

describe("profile tool descriptions", () => {
  it.each([getProfileConfigJSON, getProfileLimitsConfigJSON, getProfileStatisticsConfigJSON, searchSecretsConfigJSON])("example for $name validates against its schema", (tool) => {
    const example = extractExample(tool.description);
    expect(z.object(tool.parameters).safeParse(example).success).toBe(true);
  });
});

describe("get_profile", () => {
  it("fetches the current profile and keeps the info sub-object in the concise view", async () => {
    const info = vi.fn().mockResolvedValue({ info: { id: PROFILE_ID, name: "Main Profile" }, allocation: { input: 1000 } });
    const context = makeTestContext({ resources: { profiles: { info } } });

    const output = await getProfileConfigJSON.tool(context, {});

    expect(info).toHaveBeenCalledWith("current");
    expect(output).toContain("Main Profile");
    expect(output).not.toContain("allocation");
  });
});

describe("get_profile_limits", () => {
  it("formats limit/used pairs from the profile summary with the units legend", async () => {
    const info = vi.fn().mockResolvedValue({ info: { id: PROFILE_ID } });
    const summary = vi.fn().mockResolvedValue({
      limit: { input: 1000, output: 5000 },
      limit_used: { input: 250, output: 40 },
      amount: { device: 12, analysis: 3 },
    });
    const context = makeTestContext({ resources: { profiles: { info, summary } } });

    const output = await getProfileLimitsConfigJSON.tool(context, {});

    expect(summary).toHaveBeenCalledWith(PROFILE_ID);
    expect(output).toContain("input");
    expect(output).toContain("250");
    expect(output).toContain("1000");
    expect(output).toContain("resources_amount");
    expect(output).toContain("# Units");
  });
});

describe("get_profile_statistics", () => {
  it("passes no options on a bare call", async () => {
    const info = vi.fn().mockResolvedValue({ info: { id: PROFILE_ID } });
    const usageStatisticList = vi.fn().mockResolvedValue([{ time: "2026-06-01T00:00:00Z", input: 5 }]);
    const context = makeTestContext({ resources: { profiles: { info, usageStatisticList } } });

    const output = await getProfileStatisticsConfigJSON.tool(context, {});

    expect(usageStatisticList).toHaveBeenCalledWith(PROFILE_ID, undefined);
    expect(output).toContain("input");
  });

  it("forwards the flattened date and periodicity parameters", async () => {
    const info = vi.fn().mockResolvedValue({ info: { id: PROFILE_ID } });
    const usageStatisticList = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { profiles: { info, usageStatisticList } } });

    const output = await getProfileStatisticsConfigJSON.tool(context, { start_date: "2026-01-01", end_date: "2026-06-30", periodicity: "month" });

    expect(usageStatisticList).toHaveBeenCalledWith(PROFILE_ID, { start_date: "2026-01-01", end_date: "2026-06-30", periodicity: "month" });
    expect(output).toContain("No usage statistics found");
  });
});

describe("search_secrets", () => {
  it("lists secret metadata without exposing values", async () => {
    const list = vi.fn().mockResolvedValue([{ id: SECRET_ID, key: "MY_API_KEY", value: "s3cr3t-leak", value_length: 11 }]);
    const context = makeTestContext({ resources: { secrets: { list } } });

    const output = await searchSecretsConfigJSON.tool(context, {});

    expect(output).toContain("MY_API_KEY");
    expect(output).not.toContain("s3cr3t-leak");
  });

  it("forwards filter and amount, and passes orderBy as a top-level tuple", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { secrets: { list } } });

    const output = await searchSecretsConfigJSON.tool(context, { filter: { key: "API", orderBy: "key,asc" }, amount: 5 });

    const query = list.mock.calls[0][0];
    expect(query.amount).toBe(5);
    expect(query.orderBy).toEqual(["key", "asc"]);
    expect(query.filter).toEqual({ key: "API" });
    expect(output).toContain("No secrets found");
  });

  it("rejects an invalid orderBy before calling the SDK", async () => {
    const list = vi.fn();
    const context = makeTestContext({ resources: { secrets: { list } } });

    await expect(searchSecretsConfigJSON.tool(context, { filter: { orderBy: "created_at,asc" } })).rejects.toThrow(/orderBy/);
    expect(list).not.toHaveBeenCalled();
  });

  it("supports page and fields selection", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { secrets: { list } } });

    await searchSecretsConfigJSON.tool(context, { page: 2, fields: ["id", "key", "value_length"] });

    const query = list.mock.calls[0][0];
    expect(query.page).toBe(2);
    expect(query.fields).toEqual(["id", "key", "value_length"]);
  });

  it("steers to the next page when the page is full", async () => {
    const list = vi.fn().mockResolvedValue([{ id: SECRET_ID, key: "MY_API_KEY" }]);
    const context = makeTestContext({ resources: { secrets: { list } } });

    const output = await searchSecretsConfigJSON.tool(context, { amount: 1 });

    expect(output).toContain("request page 2");
  });
});
