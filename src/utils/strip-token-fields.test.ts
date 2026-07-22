import { describe, expect, it } from "vitest";

import { stripTokenFields } from "./strip-token-fields";

describe("stripTokenFields", () => {
  it("removes credential fields at any depth while preserving Date values and other fields", () => {
    const createdAt = new Date("2026-01-02T03:04:05.000Z");
    const lastRun = new Date("2026-02-03T04:05:06.000Z");
    const input = {
      id: "6299f0b1c72f2f00181d8b3c",
      name: "My Analysis",
      token: "a-secret-token",
      created_at: createdAt,
      nested: {
        analysis_token: "a-another-secret",
        last_run: lastRun,
        keep: "value",
      },
      list: [{ token: "a-list-secret", updated_at: createdAt, label: "one" }, lastRun, "plain", 42],
    };

    const stripped = stripTokenFields(input) as {
      id: string;
      name: string;
      token?: string;
      created_at: Date;
      nested: { analysis_token?: string; last_run: Date; keep: string };
      list: [{ token?: string; updated_at: Date; label: string }, Date, string, number];
    };

    expect(stripped.token).toBeUndefined();
    expect(stripped.nested.analysis_token).toBeUndefined();
    expect(stripped.list[0].token).toBeUndefined();

    expect(stripped.created_at).toBeInstanceOf(Date);
    expect((stripped.created_at as Date).toISOString()).toBe("2026-01-02T03:04:05.000Z");
    expect(stripped.nested.last_run).toBeInstanceOf(Date);
    expect(stripped.list[0].updated_at).toBeInstanceOf(Date);
    expect(stripped.list[1]).toBeInstanceOf(Date);

    expect(stripped.id).toBe("6299f0b1c72f2f00181d8b3c");
    expect(stripped.name).toBe("My Analysis");
    expect(stripped.nested.keep).toBe("value");
    expect(stripped.list[2]).toBe("plain");
    expect(stripped.list[3]).toBe(42);
  });
});
