import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

import { makeTestContext } from "../../../../testing/context";
import { getRunUserConfigJSON } from "../get-run-user";
import { searchRunUsersConfigJSON } from "../search-run-users";

const RUN_USER_ID = "61f0000000000000000f0001";

function extractExample(description: string): unknown {
  const match = description.match(/<example>([\s\S]*?)<\/example>/);
  return JSON.parse(match![1].trim());
}

describe("search_run_users", () => {
  it("description example validates against the tool schema", () => {
    const example = extractExample(searchRunUsersConfigJSON.description);
    expect(z.object(searchRunUsersConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  // Regression: the old run-user-lookup threw "Query is required" on a bare call.
  it("works with zero filters and applies a default query", async () => {
    const listUsers = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { run: { listUsers } } });

    const output = await searchRunUsersConfigJSON.tool(context, {});

    expect(listUsers).toHaveBeenCalledWith(expect.objectContaining({ amount: 20, fields: expect.arrayContaining(["id", "name", "email"]) }));
    expect(listUsers.mock.calls[0][0].filter).toBeUndefined();
    expect(output).toContain("No run users found");
  });

  it("passes an exact id filter through to the SDK", async () => {
    const listUsers = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { run: { listUsers } } });

    await searchRunUsersConfigJSON.tool(context, { filter: { id: RUN_USER_ID } });

    expect(listUsers.mock.calls[0][0].filter).toEqual({ id: RUN_USER_ID });
  });

  it("rejects an id filter that is not 24 characters", () => {
    const schema = z.object(searchRunUsersConfigJSON.parameters);
    expect(schema.safeParse({ filter: { id: "short" } }).success).toBe(false);
    expect(schema.safeParse({ filter: { id: RUN_USER_ID } }).success).toBe(true);
  });

  it("passes orderBy as a top-level tuple, never inside the filter", async () => {
    const listUsers = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { run: { listUsers } } });

    await searchRunUsersConfigJSON.tool(context, { filter: { name: "john", orderBy: "last_login,desc" } });

    const query = listUsers.mock.calls[0][0];
    expect(query.orderBy).toEqual(["last_login", "desc"]);
    expect(query.filter).toEqual({ name: "*john*" });
  });

  it("rejects an invalid orderBy before calling the SDK", async () => {
    const listUsers = vi.fn();
    const context = makeTestContext({ resources: { run: { listUsers } } });

    await expect(searchRunUsersConfigJSON.tool(context, { filter: { orderBy: "email,asc" } })).rejects.toThrow(/orderBy/);
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("applies wildcards to both name and email exactly once", async () => {
    const listUsers = vi.fn().mockResolvedValue([]);
    const context = makeTestContext({ resources: { run: { listUsers } } });

    await searchRunUsersConfigJSON.tool(context, { filter: { name: "john", email: "gmail" } });
    await searchRunUsersConfigJSON.tool(context, { filter: { name: "john", email: "gmail" } });

    for (const call of listUsers.mock.calls) {
      expect(call[0].filter.name).toBe("*john*");
      expect(call[0].filter.email).toBe("*gmail*");
    }
  });

  it("renders a concise table with id, name, email, and active", async () => {
    const listUsers = vi.fn().mockResolvedValue([{ id: RUN_USER_ID, name: "John Doe", email: "john@example.com", active: true, phone: "+1 555 0100" }]);
    const context = makeTestContext({ resources: { run: { listUsers } } });

    const output = await searchRunUsersConfigJSON.tool(context, {});

    expect(output).toContain("john@example.com");
    expect(output).toContain("1 run users");
    expect(output).not.toContain("555 0100");
  });
});

describe("get_run_user", () => {
  it("description example validates against the tool schema", () => {
    const example = extractExample(getRunUserConfigJSON.description);
    expect(z.object(getRunUserConfigJSON.parameters).safeParse(example).success).toBe(true);
  });

  it("enforces a 24-character run_user_id", () => {
    const schema = z.object(getRunUserConfigJSON.parameters);
    expect(schema.safeParse({ run_user_id: "short" }).success).toBe(false);
    expect(schema.safeParse({ run_user_id: RUN_USER_ID }).success).toBe(true);
  });

  it("fetches the user by ID and renders it", async () => {
    const userInfo = vi.fn().mockResolvedValue({ id: RUN_USER_ID, name: "John Doe", email: "john@example.com", active: true });
    const context = makeTestContext({ resources: { run: { userInfo } } });

    const output = await getRunUserConfigJSON.tool(context, { run_user_id: RUN_USER_ID });

    expect(userInfo).toHaveBeenCalledWith(RUN_USER_ID);
    expect(output).toContain("john@example.com");
  });
});
