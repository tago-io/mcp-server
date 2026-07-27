import type { UserInfo } from "@tago-io/sdk";
import { z } from "zod/v3";

import { resourceIdSchema, tagsObjectModel } from "../../../utils/global-params.model";
import { requireAtLeastOne } from "../../../utils/cross-field";
import { pickDefined } from "../../../utils/pick-defined";
import { describeErrorSafely } from "../../../utils/safe-error";
import { IToolConfig, ServerContext } from "../../types";

const UPDATE_EXAMPLE = '{ "run_user_id": "61f00000000000000c900001", "name": "Jane Roe", "active": true }';

const updateRunUserBaseSchema = z.object({
  run_user_id: resourceIdSchema("run user ID"),
  name: z.string().min(1).max(100).describe("The new display name.").optional(),
  password: z
    .string()
    .min(6)
    .describe(
      "A new password to set for the user (write-only, never echoed back in results, logs, or errors). The account's TagoRUN password policy applies on top of the 6-character minimum."
    )
    .optional(),
  timezone: z.string().min(1).describe("The new timezone, e.g. 'America/New_York'.").optional(),
  company: z.string().describe("The new company.").optional(),
  phone: z.string().describe("The new phone number.").optional(),
  language: z.string().describe("The new language code, e.g. 'en'.").optional(),
  active: z.boolean().describe("Whether the user is enabled.").optional(),
  tags: z.array(tagsObjectModel).describe("The new tags, replacing the current set entirely.").optional(),
});

type UpdateRunUserSchema = z.infer<typeof updateRunUserBaseSchema>;

const updateRunUserCrossField = requireAtLeastOne(
  ["name", "password", "timezone", "company", "phone", "language", "active", "tags"],
  "run_user_id",
  "at least one field to update (name, password, timezone, company, phone, language, active, or tags) must be provided alongside it",
  UPDATE_EXAMPLE
);

async function updateRunUserTool(context: ServerContext, params: UpdateRunUserSchema): Promise<string> {
  const { run_user_id, password, ...rest } = params;

  const changes: Partial<UserInfo> & { password?: string } = pickDefined(rest);
  if (password !== undefined) {
    changes.password = password;
  }

  try {
    await context.resources.run.userEdit(run_user_id, changes);
  } catch (error) {
    // A reflected failure (including a RUN password-policy rejection) can echo
    // the submitted password alongside the request credential; both are secrets.
    throw new Error(describeErrorSafely(error, [context.token, password]));
  }
  // Controlled local confirmation; the SDK success text is server-provided.
  return `Run user \`${run_user_id}\` updated.`;
}

const updateRunUserConfigJSON: IToolConfig = {
  name: "update_run_user",
  description: `Updates an end user in the account's TagoRUN portal by ID. Only the provided fields change; \`tags\` replaces the current set entirely.

Use this to rename a run user, reset their password, change their timezone/company/phone/language, or enable/disable them. The password is write-only and never echoed back. There is deliberately no \`email\` field: a run user's email is permanent and cannot be changed; create a new user for a different email.

<example>
${UPDATE_EXAMPLE}
</example>

Key limitations: the email is immutable (no rename path exists); at least one editable field must be provided; password-policy rejections come from the account configuration.`,
  parameters: updateRunUserBaseSchema.shape,
  title: "Update Run User",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  mutationClass: "write",
  crossFieldSchema: updateRunUserCrossField,
  tool: updateRunUserTool,
};

export { updateRunUserConfigJSON };
