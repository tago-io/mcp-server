import { ProfileSummary, Resources } from "@tago-io/sdk";
import { z } from "zod";

import { getProfileID } from "../../../utils/get-profile-id";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { IDeviceToolConfig } from "../../types";

const profileMetricsSchema = z.object({
  type: z
    .enum(["limits", "statistics"])
    .describe("Type of profile metric to retrieve. 'limits' for resource limits, 'statistics' for usage statistics. Available types: limits, statistics"),
  statisticsQuery: z
    .object({
      start_date: z.string().optional().describe("Start date for statistics filtering as ISO string. E.g: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SSZ' (ISO 8601)"),
      end_date: z.string().optional().describe("End date for statistics filtering as ISO string. E.g: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SSZ' (ISO 8601)"),
      periodicity: z.enum(["day", "month", "year"]).optional().describe("Periodicity for statistics aggregation. Available options: day, month, year"),
    })
    .optional()
    .describe("Optional parameters for statistics queries. Only used when type is 'statistics'."),
});

type ProfileMetricsSchema = z.infer<typeof profileMetricsSchema>;

/**
 * @description Fetches either the limits or statistics of the profile, depending on the 'type' parameter.
 * For statistics, optional parameters can be used to filter by date range and set periodicity.
 */
async function profileMetricsTool(resources: Resources, params: ProfileMetricsSchema) {
  const profileID = await getProfileID(resources);
  let data;

  if (params.type === "limits") {
    const rawLimits = await resources.profiles.summary(profileID).catch((error) => {
      throw `**Error fetching profile limits:** ${error}`;
    });

    const tabularFormat = Object.keys(rawLimits.limit).map((key: keyof ProfileSummary["limit"]) => {
      const limit = rawLimits.limit[key];
      const usedLimit = rawLimits.limit_used[key];

      return { resource: key, used: usedLimit, limit };
    });

    // TODO: Must get the resources limits when the SDK is updated to include the /limits endpoint
    data = { limits: tabularFormat, resources_amount: rawLimits.amount };
  }

  if (params.type === "statistics") {
    // Build options object for statistics query with only defined values
    const options: Record<string, string> = {};

    if (params.statisticsQuery?.start_date) {
      options.start_date = params.statisticsQuery.start_date;
    }
    if (params.statisticsQuery?.end_date) {
      options.end_date = params.statisticsQuery.end_date;
    }
    if (params.statisticsQuery?.periodicity) {
      options.periodicity = params.statisticsQuery.periodicity;
    }

    // Only pass options if at least one parameter is provided
    const hasOptions = Object.keys(options).length > 0;
    data = await resources.profiles.usageStatisticList(profileID, hasOptions ? (options as any) : undefined).catch((error) => {
      throw `**Error fetching profile statistics:** ${error}`;
    });
  }

  let markdownResponse = convertJSONToMarkdown(data);

  markdownResponse += `\n\n# Units\n
All the metrics below are montlhy usages, and resets every month.
Data Input: Amount of registers received
Data Output: Amount of registers read
Data Storage: Amount of registers used
Analysis Run: Analysis Run Minutes spents.
E-mails / SMS / Push Notification: Number of messages sent`;

  return markdownResponse;
}

const profileMetricsConfigJSON: IDeviceToolConfig = {
  name: "profile-metrics",
  description: `Get profile resource limits or usage statistics, depending on the 'type' parameter. 
For statistics, you can optionally provide a 'statisticsQuery' object with date range (start_date, end_date) and periodicity (day, month, year) parameters.
For time-based queries, use the current date/time reference: ${new Date().toLocaleDateString()}`,
  parameters: profileMetricsSchema.shape,
  title: "Get Profile Metrics (Limits or Statistics)",
  tool: profileMetricsTool,
};

export { profileMetricsConfigJSON, profileMetricsSchema };
