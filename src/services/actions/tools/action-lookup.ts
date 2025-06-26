import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { ActionCreateInfo, ActionQuery } from "@tago-io/sdk/lib/types";
import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema, tagsObjectModel } from "../../../utils/global-params.model";

const triggerSchema = z.union([
  z.object({
    resource: z.enum(["device", "bucket", "file", "analysis", "action", "am", "user", "financial", "profile"]).describe("The resource to monitor"),
    when: z.enum(["create", "update", "delete"]).describe("The event type to trigger on"),
    tag_key: z.string().describe("The tag key to match"),
    tag_value: z.string().describe("The tag value to match")
  }),
  z.object({
    interval: z.string().describe("The interval period (e.g. '1 minute', '2 hours')")
  }),
  z.object({
    timezone: z.union([z.string(), z.date()]).describe("The timezone for the schedule"),
    cron: z.string().describe("The cron expression for scheduling")
  }),
  z.object({
    device: z.string().describe("The device ID to monitor"),
    variable: z.string().describe("The variable name to check"),
    is: z.enum(["=", ">", "<", ">=", "<=", "<>"]).describe("The comparison operator"),
    value: z.string().describe("The value to compare against"),
    second_value: z.string().optional().describe("Second value for range comparisons").optional(),
    value_type: z.enum(["string", "number", "boolean", "*"]).describe("The type of value being compared"),
    unlock: z.boolean().optional().describe("Whether to unlock when condition is met")
  }),
  z.object({
    service_or_resource: z.enum([
      "input", "output", "analysis", "data_records", "sms", "email", 
      "run_users", "push_notification", "file_storage", "device",
      "dashboard", "action", "tcore", "team_members", "am"
    ]).describe("The service/resource to monitor"),
    condition: z.enum(["=", ">"]).describe("The comparison operator"),
    condition_value: z.number().describe("The threshold value")
  }),
  z.object({
    device: z.string().describe("The device ID to monitor"),
    variable: z.string().describe("The variable containing location data"),
    is: z.enum(["IN", "OUT"]).describe("Whether to trigger when entering or exiting"),
    value: z.object({
      center: z.array(z.number()).optional().describe("Center coordinates [longitude, latitude]"),
      radius: z.number().optional().describe("Radius in meters"),
      coordinates: z.array(z.array(z.number())).optional().describe("Polygon coordinates [[lon,lat], ...]")
    }).describe("The geofence definition"),
    unlock: z.boolean().optional().describe("Whether to unlock when condition is met")
  })
]);

const actionCreateSchema = z.object({
  name: z.string().describe("The name for action. (Required)"),
  type: z.enum(["condition", "resource", "interval", "schedule", "mqtt_topic", "usage_alert"]).describe("The type of trigger of the action. (Required)"),
  action: z.object({
    type: z.enum(["script", "notification", "email", "sms", "mqtt", "post"]).describe("The type of the action. (Required)"),
    script: z.array(z.string()).describe("The script of the action if type is script. (Required)").optional(),
    message: z.string().describe("The message of the action if type is notification or notification_run or email or sms. (Required)").optional(),
    subject: z.string().describe("The subject of the action if type is notification or notification_run or email. (Required)").optional(),
    run_user: z.string().describe("The run_user of the action if type is notification_run. (Required)").optional(),
    to: z.string().describe("The to of the action if type is email or sms. (Required)").optional(),
    bucket: z.string().describe("The bucket of the action if type is mqtt. (Required)").optional(),
    payload: z.string().describe("The payload of the action if type is mqtt. (Required)").optional(),
    topic: z.string().describe("The topic of the action if type is mqtt. (Required)").optional(),
    url: z.string().describe("The url of the action if type is post. (Required)").optional(),
    headers: z.record(z.string(), z.string()).describe("The headers of the action if type is post. (Required)").optional(),
  }).describe("The action object. (Required)"),
  tags: z.array(tagsObjectModel).describe("The tags for the action. E.g: [{ key: 'action_type', value: 'notification' }] (Optional)").optional(),
  description: z.string().describe("The description for the action. (Optional)").optional(),
  trigger_when_unlock: z.boolean().describe("The trigger when unlock status for the action. (Optional)").optional(),
  trigger: z.array(triggerSchema).describe("The trigger for the action. (Optional)").optional(),
}).describe("Schema for creating an action. (ActionCreate type)");

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
}).describe("Schema for the action list operation.");

const actionUpdateSchema = actionCreateSchema.partial().describe("Schema for the action update operation.").optional()
  .describe("Schema for the action update operation.");

// Base schema without refinement - this provides the .shape property needed by MCP
const actionBaseSchema = z.object({
  operation: z.enum(["create", "update", "list", "delete", "info"]).describe("The type of operation to perform on the action."),
  actionID: z.string().describe("The ID of the action to perform the operation on.").optional(),
  // Separate fields for different operations to maintain type safety
  createAction: actionCreateSchema.describe("The action to be created. Required for create operations.").optional(),
  listAction: actionListSchema.describe("The action to be listed. Required for list operations.").optional(),
  updateAction: actionUpdateSchema.describe("The action to be updated. Required for update operations.").optional(),
}).describe("Schema for the action operation.");

// Refined schema with validation logic
const actionSchema = actionBaseSchema.refine((data) => {
  // Validation for create operation
  if (data.operation === "create") {
    return !!data.createAction;
  }

  // Validation for update operation
  if (data.operation === "update") {
    return !!data.updateAction;
  }

  // Read and delete operations are valid with or without query
  return true;
}, {
  message: "Invalid data structure for the specified operation. Create requires createAction, update requires updateAction.",
});

type ActionOperation = z.infer<typeof actionSchema>;

function validateActionQuery(query: any): ActionQuery | undefined {
  if (!query) {
    return undefined;
  };

  const amount = query.amount || 200;
  const fields = query.fields || ["id", "active", "name", "created_at", "updated_at", "last_triggered", "tags", "type", "action"];

  return {
    amount,
    fields,
    ...query,
  };
}

/**
 * @description Fetches actions from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function actionLookupTool(resources: Resources, params: ActionOperation) {
  const validatedParams = actionSchema.parse(params);
  const { operation, actionID } = validatedParams;

  switch (operation) {
    case "list": {
      const validatedQuery = validateActionQuery(validatedParams.listAction);
      const actions = await resources.actions
        .list(validatedQuery)
        .catch((error) => {
          throw `**Error fetching actions:** ${(error as Error)?.message || error}`;
        });
      const markdownResponse = convertJSONToMarkdown(actions);
      return markdownResponse;
    }
    case "create": {
      const result = await resources.actions.create(validatedParams.createAction as ActionCreateInfo);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
    case "delete": {
      const result = await resources.actions.delete(actionID as string);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
    case "update": {
      const result = await resources.actions.edit(actionID as string, validatedParams.updateAction as Partial<ActionCreateInfo>);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
    case "info": {
      const result = await resources.actions.info(actionID as string);
      const markdownResponse = convertJSONToMarkdown(result);
      return markdownResponse;
    }
  }
}

const actionLookupConfigJSON: IDeviceToolConfig = {
  name: "action-operations",
  description: `Perform operations on actions. It can be used to create, update, list and delete actions.
  
  <example>
    {
      "operation": "create",
      "action": {
        "name": "My Action",
        "type": "condition",
        "action": {
          "type": "script",
          "script": ["script-id-123"]
        }
        "tags": [{ "key": "action_type", "value": "notification" }],
        "description": "This is a test action",
        "trigger_when_unlock": true,
        "trigger": [
          { 
            "resource": "device", 
            "when": "create", 
            "tag_key": "device_type", 
            "tag_value": "sensor" 
          }
        ]
      }
    }
  </example>

  `,
  parameters: actionBaseSchema.shape,
  title: "Action Operations",
  tool: actionLookupTool,
};

export { actionLookupConfigJSON };
export { actionBaseSchema }; // export for testing purposes
