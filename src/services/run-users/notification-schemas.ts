import { z } from "zod/v3";

import { resourceIdSchema } from "../../utils/global-params.model";

// TagoRUN renders at most four buttons per notification.
const MAX_NOTIFICATION_BUTTONS = 4;

// A button URL opens in the end user's TagoRUN session, so only web links and
// same-origin paths are allowed: a `javascript:` or `data:` URL would run there.
// A leading "//" is excluded because it is a link to another host, not a path.
const BUTTON_URL_PATTERN = /^(https?:\/\/|\/(?!\/))/;
const HTTPS_URL_PATTERN = /^https:\/\//;

// A fresh schema per field: a shared instance is advertised as a JSON Schema $ref.
const iconURLSchema = () => z.string().url().regex(HTTPS_URL_PATTERN, "must be an https:// URL");

const analysisTriggerSchema = z
  .object({
    analysis_id: resourceIdSchema("analysis ID"),
    scope: z.array(z.record(z.string(), z.unknown())).default([]).describe("Data passed to the analysis as its `scope` when the button is pressed. Defaults to []."),
  })
  .strict()
  .describe("Runs an analysis when the button is pressed.");

const httpTriggerSchema = z
  .object({
    url: z
      .string()
      .regex(BUTTON_URL_PATTERN, 'must start with http://, https://, or "/" (a TagoRUN page path)')
      .describe("Target URL: an http(s) link, or a TagoRUN page path starting with '/'. With method REDIRECT, the page or link to open."),
    method: z.enum(["POST", "GET", "PUT", "DELETE", "REDIRECT"]).describe("HTTP method, or REDIRECT to open the URL instead of calling it."),
    body: z.record(z.string(), z.unknown()).describe("Request body for POST/PUT calls.").optional(),
  })
  .strict()
  .describe("Calls or opens a URL when the button is pressed.");

const notificationButtonSchema = z
  .object({
    id: z.string().min(1).describe("Button identifier, unique within the notification, e.g. 'ack'."),
    label: z.string().min(1).describe("Button text."),
    color: z.string().describe("Button color as a hex value, e.g. '#337ab7'.").optional(),
    triggers: z
      .array(z.union([analysisTriggerSchema, httpTriggerSchema]))
      .min(1)
      .describe("What pressing the button does."),
  })
  .strict();

const notificationButtonsSchema = z
  .array(notificationButtonSchema)
  .max(MAX_NOTIFICATION_BUTTONS)
  .describe(`Action buttons shown on the notification (at most ${MAX_NOTIFICATION_BUTTONS}).`);

const notificationIconSchema = z
  .union([
    z
      .object({
        svg_url: iconURLSchema(),
        svg_color: z.string().optional(),
        bg_color: z.string().optional(),
      })
      .strict(),
    z
      .object({
        image_url: iconURLSchema(),
        bg_color: z.string().optional(),
        fit: z.enum(["fill", "contain", "cover"]).optional(),
      })
      .strict(),
  ])
  .describe("Notification icon: an SVG (`svg_url`) or an image (`image_url`).");

const buttonsEnabledSchema = z.boolean().describe("Whether the buttons can be pressed.");

const buttonsAutodisableSchema = z.boolean().describe("Whether the buttons disable after the first press.");

export { buttonsAutodisableSchema, buttonsEnabledSchema, notificationButtonsSchema, notificationIconSchema };
