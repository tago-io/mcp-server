import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { ActionQuery } from "@tago-io/sdk/lib/types";

import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema, tagsObjectModel } from "../../../utils/global-params.model";

const actionListSchema = querySchema.extend({
  filter: z
    .object({
      name: z
        .string()
        .describe(`
          The name filter uses wildcard matching, so do not need to specify the exact action name.
          For example, searching for "notification" finds actions like "Notification Action" and "Notification Action 2".
        `)
        .transform((val) => `*${val}*`)
        .optional(),
      active: z.boolean().describe("Filter by active status. E.g: true").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'action_type', value: 'notification' }]").optional(),
    })
    .describe("Filter object to apply to the query. Available filters: name, active, last_triggered, created_at, updated_at, tags")
    .optional(),
  fields: z
    .array(z.enum(["id", "active", "name", "created_at", "updated_at", "last_triggered", "tags", "type", "action"]))
    .describe("Specific fields to include in the action list response. Available fields: id, active, name, created_at, updated_at, last_triggered, tags, type, action")
    .optional(),
});

/**
 * @description Fetches actions from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function actionLookupTool(resources: Resources, query?: ActionQuery) {
  const amount = query?.amount || 200;
  const fields = query?.fields || ["id", "active", "name", "created_at", "updated_at", "last_triggered", "tags", "type", "action"];

  const actions = await resources.actions
    .list({
      amount,
      fields,
      ...query,
    })
    .catch((error) => {
      throw `**Error fetching actions:** ${(error as Error)?.message || error}`;
    });

  const markdownResponse = convertJSONToMarkdown(actions);

  return markdownResponse;
}

const actionLookupConfigJSON: IDeviceToolConfig = {
  name: "action-lookup",
  description: "Get a list of actions.",
  parameters: actionListSchema.shape,
  title: "Get Action List",
  tool: actionLookupTool,
};

export { actionLookupConfigJSON };
export { actionListSchema }; // export for testing purposes
