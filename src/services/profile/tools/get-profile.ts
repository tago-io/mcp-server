import { z } from "zod/v3";

import { responseFormatSchema } from "../../../utils/global-params.model";
import { renderItem } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";

const getProfileSchema = {
  response_format: responseFormatSchema,
};

type GetProfileParams = z.infer<z.ZodObject<typeof getProfileSchema>>;

async function getProfileTool(context: ServerContext, params: GetProfileParams): Promise<string> {
  const profile = (await context.resources.profiles.info("current")) as unknown as Record<string, unknown>;
  return renderItem(profile, ["info"], params.response_format);
}

const getProfileConfigJSON: IToolConfig = {
  name: "get_profile",
  description: `Fetches the current TagoIO profile's information: id, name, and account metadata for the profile the token belongs to.

Use when you need to identify which profile the server is operating on, get the profile ID for other calls, or confirm account context. For resource limits use get_profile_limits; for usage over time use get_profile_statistics.

<example>
{"response_format": "concise"}
</example>`,
  parameters: getProfileSchema,
  title: "Get Profile Info",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getProfileTool,
};

export { getProfileConfigJSON };
