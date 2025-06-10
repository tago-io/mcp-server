import { z } from "zod/v3";

import { queryModel, tagsObjectModel } from "../../utils/global-params.model";

const entityListModel = {
  ...queryModel,
  filter: z
    .object({
      name: z.string().describe("Filter by name. E.g: 'Entity Test'").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'entity_type', value: 'sensor' }]").optional(),
    })
    .describe("Filter object to apply to the query. Available filters: name, tags")
    .optional(),
  fields: z
    .array(z.enum(["id", "name", "schema", "index", "tags", "payload_decoder", "created_at", "updated_at"]))
    .describe("Specific fields to include in the entity list response. Available fields: id, name, schema, index, tags, payload_decoder, created_at, updated_at")
    .optional(),
};

export { entityListModel };
