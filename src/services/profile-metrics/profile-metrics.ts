import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { toMarkdown } from "../../utils/markdown";
import { genericIDModel } from "../../utils/global-params.model";
import { StatisticsDate } from "@tago-io/sdk/lib/types";
import { profileStatisticsModel } from "./profile-metrics.model";

/**
 * @description Get the limits of the profile and returns a Markdown-formatted response.
 */
async function getProfileLimitsByID(resources: Resources, profileID: string) {
  // 659d7ffe712b4b0009aca22d
  const limits = await resources.profiles.summary(profileID).catch((error) => {
    throw `**Error to get profile limits:** ${error}`;
  });

  const markdownResponse = toMarkdown(limits);

  return markdownResponse;
}

/**
 * @description Get the statistics of the profile and returns a Markdown-formatted response.
 */
async function getProfileStatisticsByID(resources: Resources, profileID: string, query?: StatisticsDate) {
  const statistics = await resources.profiles.usageStatisticList(profileID, query).catch((error) => {
    throw `**Error to get profile statistics:** ${error}`;
  });

  const markdownResponse = toMarkdown(statistics);

  return markdownResponse;
}

/**
 * @description Handler for profile metrics tools to register tools in the MCP server.
 */
async function handlerProfileMetricsTools(server: McpServer, resources: Resources) {
  server.tool("get-profile-limits-by-id", "Get the resources limits of the profile by its ID.", genericIDModel, { title: "Get Profile Limits by ID" }, async (params) => {
    const result = await getProfileLimitsByID(resources, params.id);
    return { content: [{ type: "text", text: result }] };
  });

  server.tool(
    "get-profile-statistics-by-id",
    `Get the statistics of the profile by its ID.

     By default, the statistics data is returned of last 24 hours for each hour.

     The following time period limits apply to the statistics query:
     - Monthly statistics: Limited to 1 year of data
     - Daily statistics: Limited to 1 month of data
     - Hourly statistics: Limited to 1 day of data

     For example, if requesting hourly statistics, the start_date and end_date parameters must be within a 24-hour period.
       `,
    profileStatisticsModel,
    { title: "Get Profile Statistics by ID" },
    async (params) => {
      const { id: profileID, ...queryParams } = params;
      const result = await getProfileStatisticsByID(resources, profileID, queryParams);
      return { content: [{ type: "text", text: result }] };
    }
  );
}

export { handlerProfileMetricsTools };
