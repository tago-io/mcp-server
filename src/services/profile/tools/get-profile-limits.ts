import type { ProfileSummary } from "@tago-io/sdk";
import { z } from "zod/v3";

import { getProfileID } from "../../../utils/get-profile-id";
import { responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const getProfileLimitsSchema = {
  response_format: responseFormatSchema,
};

type GetProfileLimitsParams = z.infer<z.ZodObject<typeof getProfileLimitsSchema>>;

const UNITS_LEGEND = `# Units

All the metrics above are monthly usages and reset every month.
Data Input: amount of registers received
Data Output: amount of registers read
Data Storage: amount of registers used
Analysis Run: analysis run minutes spent
E-mails / SMS / Push Notification: number of messages sent`;

async function getProfileLimitsTool(context: ServerContext, params: GetProfileLimitsParams): Promise<string> {
  const { resources } = context;
  const profileID = await getProfileID(resources);
  const summary = await resources.profiles.summary(profileID);

  const limitKeys = Object.keys(summary.limit) as Array<keyof ProfileSummary["limit"]>;
  const limits = limitKeys.map((key) => ({ resource: key, used: summary.limit_used[key], limit: summary.limit[key] }));

  const data = { limits, resources_amount: summary.amount };
  return `${renderItem(data, ["limits", "resources_amount"], params.response_format)}\n\n${UNITS_LEGEND}`;
}

const getProfileLimitsConfigJSON: IToolConfig = {
  name: "get_profile_limits",
  description: `Fetches the current profile's service limits alongside current usage (data input/output, storage, analysis minutes, SMS, e-mail, push notifications) plus how many of each resource (devices, dashboards, analyses, users) exist.

Use when you need to check quota headroom, diagnose limit-related errors, or report on account consumption. Usage metrics are monthly and reset each month. For usage over time, use get_profile_statistics instead.

<example>
{"response_format": "concise"}
</example>`,
  parameters: getProfileLimitsSchema,
  title: "Get Profile Limits",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getProfileLimitsTool,
};

export { getProfileLimitsConfigJSON };
