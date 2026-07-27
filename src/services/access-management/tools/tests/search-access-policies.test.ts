import { Resources } from "@tago-io/sdk";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod/v3";

import { TEST_REGION, makeTestContext } from "../../../../testing/context";
import { resetAccessPolicies } from "../../../../testing/mocks/am-policies";
import { fixtures } from "../../../../testing/mocks/fixtures";
import { mockServer, strictListenOptions } from "../../../../testing/mocks/server";
import { deleteAccessPolicyConfigJSON } from "../delete-access-policy";
import { searchAccessPoliciesConfigJSON } from "../search-access-policies";

const PROFILE_TOKEN = "p-0000000000000000000000000000000000";

function context() {
  const resources = new Resources({ token: PROFILE_TOKEN, region: TEST_REGION });
  return makeTestContext({ resources, token: PROFILE_TOKEN, credentialKind: "profile" });
}

async function searchPolicies(params: Record<string, unknown> = {}) {
  const parsed = z.object(searchAccessPoliciesConfigJSON.parameters).parse(params);
  return searchAccessPoliciesConfigJSON.tool(context(), parsed as never);
}

beforeAll(() => mockServer.listen(strictListenOptions));
beforeEach(() => resetAccessPolicies());
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("search_access_policies renders what the list endpoint can actually return", () => {
  it("lists the profile's policies", async () => {
    const result = await searchPolicies();

    expect(result).toContain("[Analysis] - Parser device access");
    expect(result).toContain("[Run] - Dashboard access");
  });

  it("never renders rules or targets, because the endpoint does not return them", async () => {
    const result = await searchPolicies({ response_format: "detailed" });
    // Everything before the steering line; the line itself names both words.
    const [rows] = result.split("This endpoint does not return");

    expect(rows).not.toContain("permissions");
    expect(rows).not.toContain("targets");
    expect(rows).not.toContain("send_data");
    expect(result).toContain("Read it with get_access_policy");
  });

  it("does not offer rules or targets as selectable fields", () => {
    const fields = z.object(searchAccessPoliciesConfigJSON.parameters).shape.fields;
    const rejected = fields.safeParse(["permissions"]);

    expect(rejected.success).toBe(false);
    expect(fields.safeParse(["id", "name", "active"]).success).toBe(true);
  });

  it("filters by active status", async () => {
    const result = await searchPolicies({ filter: { active: false } });

    expect(result).toContain("[Run] - Dashboard access");
    expect(result).not.toContain("[Analysis] - Parser device access");
  });

  it("wildcards the name filter", async () => {
    const result = await searchPolicies({ filter: { name: "Parser" } });

    expect(result).toContain("[Analysis] - Parser device access");
    expect(result).not.toContain("[Run] - Dashboard access");
  });

  it("renders exactly the requested fields and drops the rest", async () => {
    const result = await searchPolicies({ fields: ["id", "name"] });
    const [header] = result.split("\n");

    expect(header).toContain("name");
    expect(header).toContain("id");
    expect(header).not.toContain("active");
    // `tags` is force-added to the API query but must not be rendered.
    expect(header).not.toContain("tags");
  });
});

describe("search_access_policies steers a denied analysis toward the fix", () => {
  it("explains an empty result rather than just reporting none", async () => {
    const parsed = z.object(deleteAccessPolicyConfigJSON.parameters);
    for (const policy of fixtures.accessPolicies) {
      await deleteAccessPolicyConfigJSON.tool(context(), parsed.parse({ access_policy_id: policy.id }) as never);
    }

    const result = await searchPolicies();

    expect(result).toContain("No access policies found");
    expect(result).toContain("Authorization Denied");
    expect(result).toContain("lookup_access_permissions");
  });
});

describe("delete_access_policy", () => {
  it("removes the policy and says the grants are gone", async () => {
    const parsed = z.object(deleteAccessPolicyConfigJSON.parameters).parse({ access_policy_id: fixtures.accessPolicies[0].id });
    const result = await deleteAccessPolicyConfigJSON.tool(context(), parsed as never);

    expect(result).toContain("deleted");
    expect(result).toContain("loses those permissions");
    expect(await searchPolicies()).not.toContain("[Analysis] - Parser device access");
  });
});

describe("search_access_policies renders only fields it advertises", () => {
  // The API returns `profile` whatever `fields` asks for. Rendering it puts a
  // column in the table that `fields` cannot name or exclude, which is exactly
  // the contract this domain's search is documented to keep.
  it("does not render the profile column the API returns unasked", async () => {
    const result = await searchPolicies({ response_format: "detailed" });

    expect(result).not.toContain("profile");
    expect(result).toContain(fixtures.accessPolicies[0].name);
  });
});
