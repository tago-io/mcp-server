import { z } from "zod/v3";

import { queryModel, tagsObjectModel } from "../../utils/global-params.model";

const userListModel = {
  ...queryModel,
  filter: z
    .object({
      name: z.string().describe("Filter by name. E.g: 'User Test'").optional(),
      email: z.string().describe("Filter by email. E.g: 'example@email.com'").optional(),
      active: z.boolean().describe("Filter by active status. E.g: true").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'user_type', value: 'admin' }]").optional(),
    })
    .describe("Filter object to apply to the query. Available filters: name, tags")
    .optional(),
  fields: z
    .array(z.enum(["id", "name", "email", "timezone", "company", "phone", "language", "tags", "active", "last_login", "created_at", "updated_at"]))
    .describe(
      "Specific fields to include in the user list response. Available fields: id, name, email, timezone, company, phone, language, tags, active, last_login, created_at, updated_at"
    )
    .optional(),
};

export { userListModel };
