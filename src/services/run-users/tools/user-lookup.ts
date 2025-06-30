import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema, tagsObjectModel } from "../../../utils/global-params.model";
import { UserQuery } from "@tago-io/sdk/lib/modules/Resources/run.types";

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

// Base schema without refinement - this provides the .shape property needed by MCP
const userBaseSchema = z.object({
  operation: z.enum(["lookup"]).describe("The type of operation to perform on the user."),
  runUserID: z.string().describe("The ID of the user to perform the operation on. Optional for lookup and create, but required for update and delete operations.")
    .length(24, "ID must be 24 characters long").optional(),
  // Separate fields for different operations to maintain type safety
  lookupUser: userListSchema.describe("The user to be listed. Required for lookup operations.").optional(),
}).describe("Schema for the user operation. The delete operation only requires the runUserID.");

//TODO: add refine for create and update operations
const userSchema = userBaseSchema.refine(() => {
  // list and info operations are valid with or without query
  return true;
}, {
  message: "Invalid data structure for the specified operation. Create requires createAnalysis, update requires updateAnalysis.",
});

type UserSchema = z.infer<typeof userSchema>;

function validateUserQuery(query: any): UserQuery {
  if (!query) {
    throw new Error("Query is required");
  };

  const amount = query.amount || 200;
  const fields = query.fields || ["id", "name", "email", "timezone", "company", "phone", "language", "tags", "active", "last_login", "created_at", "updated_at"];

  return {
    amount,
    fields,
    ...query,
  };
}

/**
 * @description Fetches users from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function userOperationsTool(resources: Resources, params: UserSchema) {
  const validatedParams = userSchema.parse(params);
  const { operation, runUserID } = validatedParams;

  switch (operation) {
    case "lookup": {
      if (runUserID) {
        const result = await resources.run.userInfo(runUserID as string);
        const markdownResponse = convertJSONToMarkdown(result);
        return markdownResponse;
      }
      const validatedQuery = validateUserQuery(validatedParams.lookupUser);
      const users = await resources.run
        .listUsers(validatedQuery)
        .catch((error) => {
          throw `**Error fetching users:** ${(error as Error)?.message || error}`;
        });
      const markdownResponse = convertJSONToMarkdown(users);
      return markdownResponse;
    }
  }
}

const userLookupConfigJSON: IDeviceToolConfig = {
  name: "run-user-operations",
  description: `Perform operations on run users. It can be used to list users.
  
  <example>
    {
      "operation": "lookup",
      "lookupUser": {
        "amount": 100,
        "fields": ["id", "name", "email", "timezone", "company", "phone", "language", "tags", "active", "last_login", "created_at", "updated_at"],
        "filter": {
          "name": "john",
          "tags": [{ "key": "user_type", "value": "admin" }]
        }
      }
    }
  </example>

  `,
  parameters: userBaseSchema.shape,
  title: "Run User Operations",
  tool: userOperationsTool,
};

export { userLookupConfigJSON };
export { userBaseSchema }; // export for testing purposes
