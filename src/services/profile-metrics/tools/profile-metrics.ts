import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";

import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { getProfileID } from "../../../utils/get-profile-id";

const profileMetricsSchema = z.object({
  type: z
    .enum(["limits", "statistics"])
    .describe("Type of profile metric to retrieve. 'limits' for resource limits, 'statistics' for usage statistics. Available types: limits, statistics"),
});

type ProfileMetricsSchema = z.infer<typeof profileMetricsSchema>;

/**
 * @description Fetches either the limits or statistics of the profile, depending on the 'type' parameter.
 */
async function profileMetricsTool(resources: Resources, params: ProfileMetricsSchema) {
  const profileID = await getProfileID(resources);
  let data;

  if (params.type === "limits") {
    data = await resources.profiles.summary(profileID).catch((error) => {
      throw `**Error fetching profile limits:** ${error}`;
    });
  }

  if (params.type === "statistics") {
    data = await resources.profiles.usageStatisticList(profileID).catch((error) => {
      throw `**Error fetching profile statistics:** ${error}`;
    });
  }

  const markdownResponse = convertJSONToMarkdown(data);

  return markdownResponse;
}

const profileMetricsConfigJSON: IDeviceToolConfig = {
  name: "profile-metrics",
  description: "Get profile resource limits or usage statistics, depending on the 'type' parameter.",
  parameters: profileMetricsSchema.shape,
  title: "Get Profile Metrics (Limits or Statistics)",
  tool: profileMetricsTool,
};

export { profileMetricsConfigJSON, profileMetricsSchema };
