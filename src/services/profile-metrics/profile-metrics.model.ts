import { z } from "zod/v3";

import { genericIDModel } from "../../utils/global-params.model.js";

/**
 * Zod schema for profile statistics parameters
 * Based on the StatisticsDate type from @tago-io/sdk
 */
const profileStatisticsModel = {
  ...genericIDModel,
  timezone: z.string().describe("Timezone to be used in the statistics entries. Default is 'UTC'. E.g: 'America/New_York', 'Europe/London'").optional(),
  date: z
    .union([z.string().datetime(), z.date()])
    .describe("Timestamp for fetching the hourly statistics in a specific day. Used for getting hourly statistics for a single day.")
    .optional(),
  start_date: z
    .union([z.string().datetime(), z.date()])
    .describe("Starting date for fetching statistics in an interval. Required when using a date range. E.g: 'YYYY-MM-DDTHH:MM:SSZ' (ISO 8601)")
    .optional(),
  end_date: z
    .union([z.string().datetime(), z.date()])
    .describe("End date for fetching statistics in an interval. Required when using a date range. E.g: 'YYYY-MM-DDTHH:MM:SSZ' (ISO 8601)")
    .optional(),
  periodicity: z
    .enum(["hour", "day", "month"])
    .describe(`
      Periodicity of the statistics to fetch. Required when using a date range.

      Available options:
      - hour: Fetch hourly statistics within the date range
      - day: Fetch daily statistics within the date range
      - month: Fetch monthly statistics within the date range

      Default is "hour".
    `)
    .optional(),
};

export { profileStatisticsModel };
