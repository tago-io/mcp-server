import type { UserCreateInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { tagsObjectModel } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { IToolConfig, ServerContext } from "../../types";

const CREATE_EXAMPLE = '{ "name": "Jane Doe", "email": "jane@example.com", "password": "s3cure-pass", "timezone": "America/New_York", "active": true }';

const createRunUserBaseSchema = z.object({
  name: z.string().min(1).describe("The end user's display name.").max(100),
  email: z.string().email().describe("The end user's login email. This is permanent; a run user cannot be renamed to a different email later."),
  password: z
    .string()
    .min(6)
    .describe(
      "The end user's initial password (write-only, never echoed back in results, logs, or errors). The account's TagoRUN password policy applies on top of the 6-character minimum; a policy rejection is surfaced verbatim so you can adjust."
    ),
  timezone: z.string().min(1).describe("The end user's timezone, e.g. 'America/New_York' or 'UTC'."),
  company: z.string().describe("The end user's company.").optional(),
  phone: z.string().describe("The end user's phone number.").optional(),
  language: z.string().describe("The end user's language code, e.g. 'en'.").optional(),
  tags: z.array(tagsObjectModel).describe("The tags for the run user. E.g: [{ key: 'user_type', value: 'admin' }]").optional(),
  active: z.boolean().describe("Whether the user starts enabled. The server default is INACTIVE; pass true to let the user log in immediately.").optional(),
});

type CreateRunUserSchema = z.infer<typeof createRunUserBaseSchema>;

async function createRunUserTool(context: ServerContext, params: CreateRunUserSchema): Promise<string> {
  const body: UserCreateInfo = {
    name: params.name,
    email: params.email,
    password: params.password,
    timezone: params.timezone,
  };
  if (params.company !== undefined) {
    body.company = params.company;
  }
  if (params.phone !== undefined) {
    body.phone = params.phone;
  }
  if (params.language !== undefined) {
    body.language = params.language;
  }
  if (params.tags !== undefined) {
    body.tags = params.tags;
  }
  if (params.active !== undefined) {
    body.active = params.active;
  }

  try {
    const result = await context.resources.run.userCreate(body);
    return `Run user created with ID \`${result.user}\`. It starts inactive unless you passed active: true; enable it later with update_run_user.`;
  } catch (error) {
    // A reflected failure (including a RUN password-policy rejection) can echo
    // the submitted password alongside the request credential; both are secrets.
    throw new Error(describeErrorSafely(error, [context.token, params.password]));
  }
}

const createRunUserConfigJSON: IToolConfig = {
  name: "create_run_user",
  description: `Creates a new end user in the account's TagoRUN portal (TagoIO's white-label application for end users).

Use this when the user wants to add a TagoRUN end user. Name, email, password, and timezone are required. New users are created INACTIVE by default; pass active: true to let them log in immediately. The password is write-only: it is never echoed back in results, logs, or errors. The account layers its own TagoRUN password policy on top of the 6-character minimum, so a weak password may be rejected with the policy's own message.

<example>
${CREATE_EXAMPLE}
</example>

Key limitations: the email is permanent (there is no rename path; update_run_user cannot change it); the server default is inactive; password-policy rejections come from the account configuration, not this tool.`,
  parameters: createRunUserBaseSchema.shape,
  title: "Create Run User",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  mutationClass: "write",
  tool: createRunUserTool,
};

export { createRunUserConfigJSON };
