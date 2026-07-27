import type { StatisticsDate } from "@tago-io/sdk";
import { z } from "zod/v3";

import { getProfileID } from "../../../utils/get-profile-id";
import { responseFormatSchema } from "../../../utils/global-params.model";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { IToolConfig, ServerContext } from "../../types";

const getProfileStatisticsSchema = {
  start_date: z.string().describe("Start date as ISO string. E.g: '2026-01-01' or '2026-01-01T00:00:00Z'").optional(),
  end_date: z.string().describe("End date as ISO string. E.g: '2026-06-30' or '2026-06-30T23:59:59Z'").optional(),
  periodicity: z.enum(["day", "month", "year"]).describe("Aggregation period for the statistics series.").optional(),
  response_format: responseFormatSchema,
};

type GetProfileStatisticsParams = z.infer<z.ZodObject<typeof getProfileStatisticsSchema>>;

async function getProfileStatisticsTool(context: ServerContext, params: GetProfileStatisticsParams): Promise<string> {
  const { resources } = context;
  const profileID = await getProfileID(resources);

  const options: Record<string, string> = {};
  if (params.start_date) {
    options.start_date = params.start_date;
  }
  if (params.end_date) {
    options.end_date = params.end_date;
  }
  if (params.periodicity) {
    options.periodicity = params.periodicity;
  }

  const hasOptions = Object.keys(options).length > 0;
  const statistics = await resources.profiles.usageStatisticList(profileID, hasOptions ? (options as StatisticsDate) : undefined);

  if (statistics.length === 0) {
    return "No usage statistics found for the requested period. Widen the date range or drop the date filters.";
  }

  // Each entry only carries the services used in that period, so the series is
  // always rendered in full; a fixed concise field list would drop real usage.
  return convertJSONToMarkdown(statistics);
}

const getProfileStatisticsConfigJSON: IToolConfig = {
  name: "get_profile_statistics",
  description: `Fetches the current profile's usage statistics over time as a series of timestamped entries (data input/output, analysis minutes, SMS, e-mail, and other service usage per period).

Use when you need usage trends, consumption over a date range, or historical data for reporting. Filter with start_date/end_date and choose the aggregation with periodicity (day, month, or year). For current limits and quota headroom, use get_profile_limits instead.

<example>
{"start_date": "2026-01-01", "end_date": "2026-06-30", "periodicity": "month"}
</example>`,
  parameters: getProfileStatisticsSchema,
  title: "Get Profile Usage Statistics",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: getProfileStatisticsTool,
};

export { getProfileStatisticsConfigJSON };
