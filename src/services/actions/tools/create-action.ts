import { z } from "zod/v3";

import { tagsObjectModel } from "../../../utils/global-params.model";
import { invalidParamError } from "../../../utils/tool-errors";
import { IToolConfig, ServerContext } from "../../types";

const resourceTriggerSchema = z
  .object({
    resource: z.enum(["device", "bucket", "file", "analysis", "action", "am", "user", "financial", "profile"]).describe("The resource to monitor"),
    when: z.enum(["create", "update", "delete"]).describe("The event type to trigger on"),
    tag_key: z.string().describe("The tag key to match"),
    tag_value: z.string().describe("The tag value to match"),
  })
  .strict()
  .describe("This schema is used when the trigger is based on type resource.");

const intervalTriggerSchema = z
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
  .strict()
  .describe("This schema is used when the trigger is based on type interval.");

const scheduleTriggerSchema = z
  .object({
    timezone: z.union([z.string(), z.date()]).describe("The timezone for the schedule"),
    cron: z.string().describe("The cron expression for scheduling"),
  })
  .strict()
  .describe("This schema is used when the trigger is based on type schedule.");

const conditionTriggerSchema = z
  .object({
    device: z.string().describe("The device ID to monitor"),
    variable: z.string().describe("The variable name to check"),
    is: z.enum(["<", ">", "=", "!", "><", "*"]).describe('The comparison operator: "<", ">", "=", "!" (not equal), "><" (between, requires second_value), "*" (any value)'),
    value: z.string().describe("The value to compare against"),
    second_value: z.string().describe('Second value for "><" (between) comparisons').optional(),
    value_type: z.enum(["string", "number", "boolean", "*"]).describe("The type of value being compared"),
    unlock: z.boolean().optional().describe("Whether to unlock when condition is met"),
  })
  .strict()
  .describe("This schema is used when the trigger is based on type condition.");

const usageAlertTriggerSchema = z
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
  .strict()
  .describe("This schema is used when the trigger is based on type usage_alert.");

const geofenceTriggerSchema = z
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
  .strict()
  .describe("This schema is used when the trigger is based on type condition_geofence.");

const triggerSchema = z.union([resourceTriggerSchema, intervalTriggerSchema, scheduleTriggerSchema, conditionTriggerSchema, usageAlertTriggerSchema, geofenceTriggerSchema]);

const actionParamsSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("script"),
      script: z.array(z.string()).min(1).describe("The analysis IDs to run when the action triggers."),
    }),
    z.object({
      type: z.literal("notification"),
      message: z.string().describe("The message of the notification."),
      subject: z.string().describe("The subject of the notification."),
    }),
    z.object({
      type: z.literal("notification_run"),
      message: z.string().describe("The message of the notification."),
      subject: z.string().describe("The subject of the notification."),
      run_user: z.string().describe("The Run user ID that will receive the notification."),
    }),
    z.object({
      type: z.literal("email"),
      message: z.string().describe("The body of the email."),
      subject: z.string().describe("The subject of the email."),
      to: z.string().describe("The email address to send the email to."),
    }),
    z.object({
      type: z.literal("sms"),
      message: z.string().describe("The SMS message."),
      to: z.string().describe("The phone number to send the SMS to."),
    }),
    z.object({
      type: z.literal("mqtt"),
      bucket: z.string().describe("The device ID to receive the MQTT published message."),
      payload: z.string().describe("The message that will be published to the MQTT topic."),
      topic: z.string().describe("The topic of the MQTT message."),
    }),
    z.object({
      type: z.literal("post"),
      url: z.string().describe("The URL of the POST request."),
      headers: z.record(z.string(), z.string()).describe("The headers of the POST request. Pass an empty object `{}` when no headers are needed."),
    }),
    z.object({
      type: z.literal("sms-twilio"),
      message: z.string().describe("The SMS message."),
      to: z.string().describe("The phone number to send the SMS to."),
      from: z.string().describe("The Twilio phone number that sends the SMS."),
      twilio_sid: z.string().describe("The ID of the secret that contains the Twilio SID."),
      twilio_token: z.string().describe("The ID of the secret that contains the Twilio token."),
    }),
    z.object({
      type: z.literal("whatsapp-twilio"),
      message: z.string().describe("The WhatsApp message."),
      to: z.string().describe("The phone number to send the WhatsApp message to."),
      from: z.string().describe("The Twilio phone number that sends the WhatsApp message."),
      content_sid: z.string().describe("The ID of the secret that contains the WhatsApp message template SID."),
      twilio_sid: z.string().describe("The ID of the secret that contains the Twilio SID."),
      twilio_token: z.string().describe("The ID of the secret that contains the Twilio token."),
      content_variables: z
        .array(
          z.object({
            name: z.string().describe("The name of the variable."),
            value: z.string().describe("The value of the variable."),
          })
        )
        .describe("The variables to be sent to the Twilio WhatsApp message template. Pass an empty array `[]` when the template has no variables."),
    }),
    z.object({
      type: z.literal("email-sendgrid"),
      message: z.string().describe("The body of the email."),
      subject: z.string().describe("The subject of the email."),
      to: z.string().describe("The email address to send the email to."),
      from: z.string().describe("The email address that sends the email."),
      sendgrid_api_key: z.string().describe("The ID of the secret that contains the SendGrid API key."),
    }),
    z.object({
      type: z.literal("email-smtp"),
      message: z.string().describe("The body of the email."),
      subject: z.string().describe("The subject of the email."),
      to: z.string().describe("The email address to send the email to."),
      from: z.string().describe("The email address that sends the email."),
      smtp_secret: z.string().describe("The ID of the secret that contains the SMTP credentials."),
    }),
    z.object({
      type: z.literal("queue-sqs"),
      sqs_secret: z.string().describe("The ID of the secret that contains the AWS SQS credentials."),
      batch_enabled: z.boolean().describe("Whether the SQS queue is batch enabled."),
    }),
  ])
  .describe("What the action executes when triggered, discriminated by `type`. Each type has its own required fields.");

const actionTypeSchema = z.enum(["condition", "resource", "interval", "schedule", "mqtt_topic", "usage_alert", "condition_geofence"]).describe(`The type of trigger for the action.

The type parameter accepts one of seven values:
- "condition": Monitors device variables against specified conditions (threshold, comparison operators)
- "resource": Responds to CRUD operations on platform resources (device, file, analysis, action, am, user)
  - Resource triggers must specify which resource type to monitor (device, file, analysis, action, am, user) and which operations (create, update, delete).
- "interval": Executes actions at regular time intervals (minutes, hours, days)
- "schedule": Executes actions at specific dates/times using cron-like scheduling
- "mqtt_topic": Responds to publications on specified MQTT topics
- "condition_geofence": Triggers when devices enter or exit defined geographical boundaries
- "usage_alert": Monitors account usage metrics against thresholds for services like input/output data, analysis minutes, SMS, email, push notifications, file storage, and resource counts
  - Usage alert triggers must specify the monitored resource (input, output, analysis, data_records, sms, email, run_users, push_notification, file_storage, device, dashboard, action, tcore, team_members, am) and threshold values.`);

type ActionTypeValue = z.infer<typeof actionTypeSchema>;
type TriggerValue = z.infer<typeof triggerSchema>;

const triggerSchemaByType = {
  resource: resourceTriggerSchema,
  interval: intervalTriggerSchema,
  schedule: scheduleTriggerSchema,
  condition: conditionTriggerSchema,
  usage_alert: usageAlertTriggerSchema,
  condition_geofence: geofenceTriggerSchema,
} as const;

const triggerExampleByType: Record<keyof typeof triggerSchemaByType, string> = {
  resource: '[{ "resource": "device", "when": "create", "tag_key": "device_type", "tag_value": "sensor" }]',
  interval: '[{ "interval": "5 minutes" }]',
  schedule: '[{ "cron": "0 8 * * *", "timezone": "America/New_York" }]',
  condition: '[{ "device": "6299f0b1c72f2f00181d8b3c", "variable": "temperature", "is": ">", "value": "30", "value_type": "number" }]',
  usage_alert: '[{ "service_or_resource": "input", "condition": ">", "condition_value": 100000 }]',
  condition_geofence: '[{ "device": "6299f0b1c72f2f00181d8b3c", "variable": "location", "is": "IN", "value": { "center": [-97.7, 30.3], "radius": 5 } }]',
};

/** Fails fast (before any SDK call) when the trigger entries do not fit the action's top-level type. */
function validateTriggerMatchesType(type: ActionTypeValue, trigger: TriggerValue[] | undefined): void {
  if (type === "mqtt_topic") {
    if (trigger !== undefined && trigger.length > 0) {
      throw invalidParamError(
        "trigger",
        'must be omitted for type "mqtt_topic"; the MQTT topic goes in the mqtt action object',
        '{ "type": "mqtt_topic", "action": { "type": "mqtt", "bucket": "6299f0b1c72f2f00181d8b3c", "payload": "{}", "topic": "sensors/+" } }'
      );
    }
    return;
  }

  if (trigger === undefined || trigger.length === 0) {
    return;
  }

  const result = z.array(triggerSchemaByType[type]).safeParse(trigger);
  if (!result.success) {
    throw invalidParamError("trigger", `every entry must match the "${type}" trigger shape when \`type\` is "${type}"`, triggerExampleByType[type]);
  }
}

const createActionBaseSchema = z.object({
  name: z.string().min(1).describe("The name for the action."),
  type: actionTypeSchema,
  action: actionParamsSchema,
  active: z.boolean().describe("Whether the action starts enabled. Defaults to true.").optional(),
  trigger: z.array(triggerSchema).describe("The trigger configuration matching the action's `type`.").optional(),
  tags: z.array(tagsObjectModel).describe("The tags for the action. E.g: [{ key: 'action_type', value: 'notification' }]").optional(),
  description: z.string().describe("The description for the action.").optional(),
  trigger_when_unlock: z
    .boolean()
    .describe(
      "Trigger the action when the unlock condition is met (the trigger with the unlock property set to true). Only available for actions of type condition or condition_geofence."
    )
    .optional(),
});

type CreateActionSchema = z.infer<typeof createActionBaseSchema>;

const createActionCrossField = z.any().superRefine((value, ctx) => {
  const obj = (value ?? {}) as Record<string, unknown>;
  try {
    validateTriggerMatchesType(obj.type as ActionTypeValue, obj.trigger as TriggerValue[] | undefined);
  } catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : String(error) });
  }
});

async function createActionTool(context: ServerContext, params: CreateActionSchema): Promise<string> {
  const { name, type, action, active, trigger, tags, description, trigger_when_unlock } = params;

  const result = await context.resources.actions.create({
    name,
    type,
    action,
    active,
    trigger,
    tags,
    description,
    trigger_when_unlock,
  });

  return `Action created with ID \`${result.action}\`.`;
}

const createActionConfigJSON: IToolConfig = {
  name: "create_action",
  description: `Creates an automation action in the TagoIO profile: a workflow that executes a predefined response (run an analysis script, send a notification/email/SMS, publish to MQTT, POST to a URL, push to SQS) when a trigger fires, such as a device data condition, a resource event, a schedule, or a usage threshold.

Use this when the user wants to set up an automated response to device data changes, resource management events, scheduled operations, location-based triggers, or account usage thresholds.

Ensure that for action types that use Secrets (sms-twilio, whatsapp-twilio, email-sendgrid, email-smtp, queue-sqs), you have been provided with the Secret ID by the user. If not, state that you cannot create the action without the Secret ID.

When creating actions that affect multiple components (such as multiple devices), prefer triggers based on tag_key and tag_value rather than specific resource IDs. This provides better scalability and maintainability. Suggest adding appropriate tags to target devices or resources, or offer to add the tags directly to enable group-based triggering.

<example>
{
  "name": "Run parser on new sensors",
  "type": "resource",
  "action": {
    "type": "script",
    "script": ["6299f0b1c72f2f00181d8b3c"]
  },
  "trigger": [
    {
      "resource": "device",
      "when": "create",
      "tag_key": "device_type",
      "tag_value": "sensor"
    }
  ],
  "tags": [{ "key": "action_type", "value": "automation" }],
  "description": "Runs the parser analysis whenever a sensor device is created"
}
</example>

Key limitations: the \`trigger\` entries must match the top-level \`type\` (for "mqtt_topic", omit \`trigger\`; the topic goes in the mqtt action object); actions only define automation rules and do not execute immediately upon creation; this tool cannot monitor or control active action execution; trigger conditions must be properly configured to avoid unintended activations or missed events.`,
  parameters: createActionBaseSchema.shape,
  title: "Create Action",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: createActionCrossField,
  tool: createActionTool,
};

export { createActionConfigJSON };
export { actionParamsSchema, actionTypeSchema, triggerSchema, validateTriggerMatchesType }; // shared with update-action
export type { ActionTypeValue, TriggerValue };
