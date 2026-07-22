import { z } from "zod/v3";

import { resourceIdSchema } from "../../../utils/global-params.model";
import { describeErrorSafely } from "../../../utils/safe-error";
import { IToolConfig, ServerContext } from "../../types";
import { clampExpireTime, DEFAULT_EXPIRE_TIME, MAX_EXPIRE_MINUTES } from "../expiry-clamp";

const loginAsRunUserBaseSchema = z.object({
  run_user_id: resourceIdSchema("run user ID"),
  expire_time: z
    .string()
    .describe(
      `How long the minted token stays valid, as a relative duration. Accepts minute or hour forms only (e.g. "30 minutes", "1 hour", "2 hours"). Default "${DEFAULT_EXPIRE_TIME}", hard ceiling 2 hours. "never" and any longer or unparseable value are refused because minted tokens cannot be revoked individually.`
    )
    .optional(),
});

type LoginAsRunUserSchema = z.infer<typeof loginAsRunUserBaseSchema>;

async function loginAsRunUserTool(context: ServerContext, params: LoginAsRunUserSchema): Promise<string> {
  const expireTime = clampExpireTime(params.expire_time);

  let response: Record<string, unknown>;
  try {
    response = (await context.resources.run.loginAsUser(params.run_user_id, { expire_time: expireTime })) as unknown as Record<string, unknown>;
  } catch (error) {
    // The minted token is unknown on the failure path; redact the request
    // credential so a reflected error can never carry it.
    throw new Error(describeErrorSafely(error, [context.token]));
  }

  const token = typeof response.token === "string" ? response.token : "";
  // The response `name` is the minted TOKEN's label (e.g. "Login by Run
  // Administrator(<account email>)"), not the run user's display name.
  const tokenLabel = typeof response.name === "string" ? response.name : "(unknown)";
  // Known SDK defect: the type declares `expire_date` but the server returns
  // `expire_time`. Accept either key so the reported expiry is accurate; the
  // SDK's dateParser turns an `expire_date` string into a Date, so normalize.
  const rawExpiry = response.expire_time ?? response.expire_date ?? expireTime;
  const expiry = rawExpiry instanceof Date ? rawExpiry.toISOString() : String(rawExpiry);

  return [
    `Minted a LIVE login token for run user \`${params.run_user_id}\`.`,
    "",
    `token: ${token}`,
    `run_user: ${params.run_user_id}`,
    `token_name: ${tokenLabel}`,
    `expires: ${expiry}`,
    "",
    "This token is a live credential that authenticates AS this end user on the TagoRUN portal surface only; it is weaker than the account credential and cannot read or change account-level resources. It cannot be revoked individually; to revoke it, deactivate or delete the run user (delete_run_user / update_run_user active: false). Every call to this tool is audit-logged by the platform.",
  ].join("\n");
}

const loginAsRunUserConfigJSON: IToolConfig = {
  name: "login_as_run_user",
  description: `Mints a live login token that authenticates AS a specific TagoRUN end user, for debugging an application from that user's perspective. Returns the token intentionally; it is a real credential.

Use this only when explicitly asked to impersonate or debug as a specific end user. The Access Management "Login as user" policy must permit it, and every call is audit-logged by the platform. The minted token is scoped to the TagoRUN end-user surface only (weaker than the account credential) and cannot be revoked individually; the only way to kill it is to deactivate or delete the run user. Expiry defaults to "${DEFAULT_EXPIRE_TIME}" and is clamped to a hard 2-hour (${MAX_EXPIRE_MINUTES}-minute) ceiling; "never" and longer or unparseable durations are refused.

<example>
{ "run_user_id": "61f00000000000000c900001", "expire_time": "1 hour" }
</example>

Key limitations: no individual revocation (deactivate/delete the user); 2-hour maximum lifetime; the token grants the end user's RUN view, not account access.`,
  parameters: loginAsRunUserBaseSchema.shape,
  title: "Login as Run User",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  mutationClass: "destructive",
  tool: loginAsRunUserTool,
};

export { loginAsRunUserConfigJSON };
