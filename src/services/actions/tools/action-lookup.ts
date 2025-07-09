import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";
import { ActionCreateInfo, ActionQuery } from "@tago-io/sdk/lib/types";
import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema, tagsObjectModel } from "../../../utils/global-params.model";
import { createOperationFactory } from "../../../utils/operation-factory";

const triggerSchema = z.union([
  z
    .object({
      resource: z.enum(["device", "bucket", "file", "analysis", "action", "am", "user", "financial", "profile"]).describe("The resource to monitor"),
      when: z.enum(["create", "update", "delete"]).describe("The event type to trigger on"),
      tag_key: z.string().describe("The tag key to match"),
      tag_value: z.string().describe("The tag value to match"),
    })
    .describe("This schema is used when the trigger is based on type resource."),
  z
    .object({
      interval: z.string().describe(`This is the time between each trigger.
      This is the time between each trigger. Could be in:
      - minutes - 3 minutes
      - hours - 8 hours
      - days - 10 days
      - weeks - 2 week
      - months - 4 month
      - quarters - 3 quarter
      - years - 1 year
      `),
    })
    .describe("This schema is used when the trigger is based on type interval."),
  z
    .object({
      timezone: z.union([z.string(), z.date()]).describe("The timezone for the schedule"),
      cron: z.string().describe("The cron expression for scheduling"),
    })
    .describe("This schema is used when the trigger is based on type schedule."),
  z
    .object({
      device: z.string().describe("The device ID to monitor"),
      variable: z.string().describe("The variable name to check"),
      is: z.enum(["=", ">", "<", ">=", "<=", "<>"]).describe("The comparison operator"),
      value: z.string().describe("The value to compare against"),
      second_value: z.string().optional().describe("Second value for range comparisons").optional(),
      value_type: z.enum(["string", "number", "boolean", "*"]).describe("The type of value being compared"),
      unlock: z.boolean().optional().describe("Whether to unlock when condition is met"),
    })
    .describe("This schema is used when the trigger is based on type condition."),
  z
    .object({
      service_or_resource: z
        .enum([
          "input",
          "output",
          "analysis",
          "data_records",
          "sms",
          "email",
          "run_users",
          "push_notification",
          "file_storage",
          "device",
          "dashboard",
          "action",
          "tcore",
          "team_members",
          "am",
        ])
        .describe("The service/resource to monitor"),
      condition: z.enum(["=", ">"]).describe("The comparison operator"),
      condition_value: z.number().describe("The threshold value"),
    })
    .describe("This schema is used when the trigger is based on type usage_alert."),
  z
    .object({
      device: z.string().describe("The device ID to monitor"),
      variable: z.string().describe("The variable containing location data"),
      is: z.enum(["IN", "OUT"]).describe("Whether to trigger when entering or exiting"),
      value: z
        .object({
          center: z.array(z.number()).optional().describe("Center coordinates [longitude, latitude]"),
          radius: z.number().optional().describe("Radius in kilometers"),
          coordinates: z.array(z.array(z.number())).optional().describe("Polygon coordinates [[lon,lat], ...]"),
        })
        .describe("The geofence definition"),
      unlock: z.boolean().optional().describe("Whether to unlock when condition is met"),
    })
    .describe("This schema is used when the trigger is based on type condition_geofence."),
]);

const actionCreateSchema = z
  .object({
    name: z.string().describe("The name for action. (Required)"),
    type: z.enum(["condition", "resource", "interval", "schedule", "mqtt_topic", "usage_alert", "condition_geofence"]).describe(`The type of trigger of the action. (Required)  
    condition: This type of action is used to trigger an action when a variable of a device met a condition.

    resource: This type of action is used to trigger an action when a resource is created, updated or deleted. The resources can be:
      - device - This resource is used to trigger an action when a device is created, updated or deleted.
      - file - This resource is used to trigger an action when a file is created, updated or deleted.
      - analysis - This resource is used to trigger an action when an analysis is created, updated or deleted.
      - action - This resource is used to trigger an action when an action is created, updated or deleted.
      - am - This resource is used to trigger an action when an access management is created, updated or deleted.
      - user - This resource is used to trigger an action when a run_user is created, updated or deleted.

    interval: This type of action is used to trigger an action at a regular interval.

    schedule: This type of action is used to trigger an action at a specific time.

    mqtt_topic: This type of action is used to trigger an action when a MQTT topic is published.

    condition_geofence: This type of action is used to trigger an action when a device enters or exits a geofence.

    usage_alert: This type of action is used to trigger an action when a usage of a service or resource is above or equal to a certain threshold.
      - input - This is the resource of the amount of data_input of the account.
      - output - This is the resource of the amount of data_output of the account.
      - analysis - This is the resource of the amount of minutes of analysis of the account.
      - data_records - This is the resource of the amount of data_records of the account.
      - sms - This is the service of the amount of sms of the account.
      - email - This is the service of the amount of email of the account.
      - run_users - This is the resource of the amount of run_users of the account.
      - push_notification - This is the service of the amount of push_notification of the account.
      - file_storage - This is the service of the amount of MB of file_storage of the account.
      - device - This is the resource of the amount of device registered of the account.
      - dashboard - This is the resource of the amount of dashboard created of the account.
      - action - This is the resource of the amount of action created of the account.
      - tcore - This is the service of the amount of tcore registered in the account.
      - team_members - This is the resource of the amount of team members of the account.
      - am - This is the service of the amount of access management created of the account.
  `),
    action: z
      .object({
        type: z
          .enum(["script", "notification", "notification_run", "email", "sms", "mqtt", "post", "sms-twilio", "whatsapp-twilio", "email-sendgrid", "email-smtp", "queue-sqs"])
          .describe("The type of the action. (Required)"),
        script: z.array(z.string()).describe("Here you put the analysis ID that should be executed. Required for actions with type script.").optional(),
        message: z
          .string()
          .describe(
            "The message of the email, notification or sms to be sent. Required for actions with type notification, notification_run, email, sms, sms-twilio, whatsapp-twilio, email-sendgrid, email-smtp."
          )
          .optional(),
        subject: z
          .string()
          .describe("The subject of the email or notification to be sent. Required for actions with type email, notification, notification_run, email-sendgrid, email-smtp.")
          .optional(),
        run_user: z.string().describe("The run_user ID of the user that will receive the notification. Required for actions with type notification_run.").optional(),
        to: z
          .string()
          .describe("The phone number or email address to send the message to. Required for actions with type email, sms, sms-twilio, whatsapp-twilio, email-sendgrid, email-smtp.")
          .optional(),
        from: z
          .string()
          .describe(
            "The phone number or email address that will be used to send the message. Required for actions with type sms-twilio, whatsapp-twilio, email-sendgrid, email-smtp."
          )
          .optional(),
        bucket: z.string().describe("The device ID to receive MQTT published message. Required for actions with type mqtt.").optional(),
        payload: z.string().describe("The message that will be published to the MQTT topic. Required for actions with type mqtt.").optional(),
        topic: z.string().describe("The topic of the MQTT message. Required for actions with type mqtt.").optional(),
        url: z.string().describe("The url of the post request. Required for actions with type post.").optional(),
        headers: z.record(z.string(), z.string()).describe("The headers of the post request. Required for actions with type post.").optional(),
        twilio_sid: z.string().describe("The ID of the secret that contains the Twilio SID. Required for actions with type sms-twilio, whatsapp-twilio.").optional(),
        twilio_token: z.string().describe("The ID of the secret that contains the Twilio token. Required for actions with type sms-twilio, whatsapp-twilio.").optional(),
        content_variables: z
          .array(
            z.object({
              name: z.string().describe("The name of the variable."),
              value: z.string().describe("The value of the variable."),
            })
          )
          .describe("The variables to be sent to the Twilio WhatsApp message template. Optional for actions with type whatsapp-twilio.")
          .optional(),
        content_sid: z.string().describe("The ID of the secret that contains the WhatsApp message template. Required for actions with type whatsapp-twilio.").optional(),
        sendgrid_api_key: z.string().describe("The ID of the secret that contains the Sendgrid API key. Required for actions with type email-sendgrid.").optional(),
        smtp_secret: z.string().describe("The ID of the secret that contains the SMTP secret. Required for actions with type email-smtp.").optional(),
        sqs_secret: z.string().describe("The ID of the secret that contains the SQS secret. Required for actions with type queue-sqs.").optional(),
        batch_enabled: z.boolean().describe("Whether the SQS queue is batch enabled. Required for actions with type queue-sqs.").optional(),
      })
      .describe("The action object."),
    tags: z.array(tagsObjectModel).describe("The tags for the action. E.g: [{ key: 'action_type', value: 'notification' }]").optional(),
    description: z.string().describe("The description for the action.").optional(),
    trigger_when_unlock: z
      .boolean()
      .describe(`
    The action will be triggered when the unlock condition is met. 
    The unlock condition is the trigger that has the unlock property set to true. 
    This is only available for actions with type condition or condition_geofence.
  `)
      .optional(),
    trigger: z.array(triggerSchema).describe("The trigger for the action.").optional(),
  })
  .describe("Schema for creating an action. (ActionCreate type)");

const actionListSchema = querySchema
  .extend({
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
  })
  .describe("Schema for the action list operation.");

const actionUpdateSchema = actionCreateSchema.partial().describe("Schema for the action update operation.").optional().describe("Schema for the action update operation.");

// Base schema without refinement - this provides the .shape property needed by MCP
const actionBaseSchema = z
  .object({
    operation: z.enum(["create", "update", "delete", "lookup"]).describe("The type of operation to perform on the action."),
    actionID: z.string().describe("The ID of the action to perform the operation on. Optional for lookup and create, but required for update and delete operations.").optional(),
    // Separate fields for different operations to maintain type safety
    createAction: actionCreateSchema.describe("The action to be created. Required for create operations.").optional(),
    lookupAction: actionListSchema.describe("The action to be listed. Required for lookup operations.").optional(),
    updateAction: actionUpdateSchema.describe("The action to be updated. Required for update operations.").optional(),
  })
  .describe("Schema for the action operation. The delete operation only requires the actionID.");

// Refined schema with validation logic
const actionSchema = actionBaseSchema.refine(
  (data) => {
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
  },
  {
    message: "Invalid data structure for the specified operation. Create requires createAction, update requires updateAction.",
  }
);

type ActionOperation = z.infer<typeof actionSchema>;

function validateActionQuery(query: any): ActionQuery | undefined {
  if (!query) {
    return undefined;
  }

  const amount = query.amount || 200;
  const fields = query.fields || ["id", "active", "name", "created_at", "updated_at", "last_triggered", "tags", "type", "action"];

  return {
    amount,
    fields,
    ...query,
  };
}

// Operation handlers
async function handleLookupOperation(resources: Resources, params: ActionOperation): Promise<string> {
  const { actionID, lookupAction } = params;

  if (actionID) {
    const result = await resources.actions.info(actionID);
    return convertJSONToMarkdown(result);
  }

  const validatedQuery = validateActionQuery(lookupAction);
  const actions = await resources.actions.list(validatedQuery).catch((error) => {
    throw `**Error fetching actions:** ${(error as Error)?.message || error}`;
  });

  return convertJSONToMarkdown(actions);
}

async function handleCreateOperation(resources: Resources, params: ActionOperation): Promise<string> {
  if (!params.createAction) {
    throw new Error("createAction is required for create operation");
  }

  const result = await resources.actions.create(params.createAction as ActionCreateInfo);
  return convertJSONToMarkdown(result);
}

async function handleUpdateOperation(resources: Resources, params: ActionOperation): Promise<string> {
  const { actionID, updateAction } = params;

  if (!actionID) {
    throw new Error("actionID is required for update operation");
  }

  if (!updateAction) {
    throw new Error("updateAction is required for update operation");
  }

  const result = await resources.actions.edit(actionID, updateAction as Partial<ActionCreateInfo>);
  return convertJSONToMarkdown(result);
}

async function handleDeleteOperation(resources: Resources, params: ActionOperation): Promise<string> {
  const { actionID } = params;

  if (!actionID) {
    throw new Error("actionID is required for delete operation");
  }

  const result = await resources.actions.delete(actionID);
  return convertJSONToMarkdown(result);
}

/**
 * @description Performs action operations and returns a Markdown-formatted response.
 */
async function actionOperationsTool(resources: Resources, params: ActionOperation) {
  const validatedParams = actionSchema.parse(params);

  const factory = createOperationFactory<ActionOperation>()
    .register("lookup", (params) => handleLookupOperation(resources, params))
    .register("create", (params) => handleCreateOperation(resources, params))
    .register("update", (params) => handleUpdateOperation(resources, params))
    .register("delete", (params) => handleDeleteOperation(resources, params));

  return factory.execute(validatedParams);
}

const actionOperationsConfigJSON: IDeviceToolConfig = {
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
  tool: actionOperationsTool,
};

export { actionOperationsConfigJSON };
export { actionBaseSchema }; // export for testing purposes
