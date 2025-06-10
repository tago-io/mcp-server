import { z } from "zod/v3";

import { queryModel, tagsObjectModel } from "../../utils/global-params.model.js";

const actionListModel = {
  ...queryModel,
  filter: z
    .object({
      name: z.string().describe("Filter by name. E.g: 'John'").optional(),
      active: z.boolean().describe("Filter by active status. E.g: true").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'action_type', value: 'customer' }]").optional(),
    })
    .describe("Filter object to apply to the query. Available filters: name, active, last_triggered, created_at, updated_at, tags. E.g: { name: 'John' }")
    .optional(),
  fields: z
    .array(z.enum(["id", "active", "name", "description", "created_at", "updated_at", "last_triggered", "tags", "type", "action"]))
    .describe("Specific fields to include in the action list response. Available fields: id, active, name, description, created_at, updated_at, last_triggered, tags, type, action")
    .optional(),
};

export { actionListModel };
