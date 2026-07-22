import { z } from "zod/v3";

import { resourceIdSchema, responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const getEntitySchema = {
  entity_id: resourceIdSchema("entity ID"),
  response_format: responseFormatSchema,
};

type GetEntityParams = z.infer<z.ZodObject<typeof getEntitySchema>>;

async function getEntityTool(context: ServerContext, params: GetEntityParams): Promise<string> {
  const entity = (await context.resources.entities.info(params.entity_id)) as unknown as Record<string, unknown>;
  return renderItem(entity, ["id", "name", "schema", "index", "tags", "created_at", "updated_at"], params.response_format);
}

const getEntityConfigJSON: IToolConfig = {
  name: "get_entity",
  description: `Fetches one entity (TagoIO schema-based database table) by ID, including its schema and index definitions.

Use when you already know the entity ID (from search_entities) and need its field schema, indexes, or tags, for example before querying or writing entity data. Returns entity metadata only, not the data rows stored inside the entity.

<example>
{"entity_id": "61f0000000000000000e0001"}
</example>`,
  parameters: getEntitySchema,
  title: "Get Entity",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getEntityTool,
};

export { getEntityConfigJSON };
