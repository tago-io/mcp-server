import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";

import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema, tagsObjectModel } from "../../../utils/global-params.model";

const userListSchema = querySchema.extend({
  filter: z
    .object({
      id: z.string().describe("Filter by user ID. E.g: '123456789012345678901234'").length(24, "ID must be 24 characters long").optional(),
      name: z
        .string()
        .describe(`
          The name filter uses wildcard matching, so do not need to specify the exact user name.
          For example, searching for "john" finds users like "John Doe" and "Johnny Smith".
        `)
        .transform((val) => `*${val}*`)
        .optional(),
      email: z
        .string()
        .describe(`
          The email filter uses wildcard matching, so do not need to specify the exact email.
          For example, searching for "gmail" finds emails like "user@gmail.com" and "admin@gmail.com".
        `)
        .transform((val) => `*${val}*`)
        .optional(),
      active: z.boolean().describe("Filter by active status. E.g: true").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'user_type', value: 'admin' }]").optional(),
    })
    .describe("Filter object to apply to the query. Available filters: id, name, email, active, tags")
    .optional(),
  fields: z
    .array(z.enum(["id", "name", "email", "timezone", "company", "phone", "language", "tags", "active", "last_login", "created_at", "updated_at"]))
    .describe(
      "Specific fields to include in the user list response. Available fields: id, name, email, timezone, company, phone, language, tags, active, last_login, created_at, updated_at"
    )
    .optional(),
});

type UserListSchema = z.infer<typeof userListSchema>;

/**
 * @description Fetches users from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function userLookupTool(resources: Resources, query?: UserListSchema) {
  const amount = query?.amount || 200;
  const fields = query?.fields || ["id", "name", "email", "timezone", "company", "phone", "language", "tags", "active", "last_login", "created_at", "updated_at"];

  const users = await resources.run
    .listUsers({
      amount,
      fields,
      ...query,
    })
    .catch((error) => {
      throw `**Error fetching users:** ${error}`;
    });

  const markdownResponse = convertJSONToMarkdown(users);

  return markdownResponse;
}

const userLookupConfigJSON: IDeviceToolConfig = {
  name: "user-lookup",
  description: "Get a list of run users registered in the current profile.",
  parameters: userListSchema.shape,
  title: "Get User List",
  tool: userLookupTool,
};

export { userLookupConfigJSON };
export { userListSchema }; // export for testing purposes
