import { z } from "zod/v3";

import { resourceIdSchema } from "../../utils/global-params.model";

/**
 * Shared zod/v3 input fragments for the dashboard mutation tools. They mirror
 * the package schemas loosely; the validation adapter is the authority, these
 * only shape the MCP input surface.
 */

const tabsSchema = z
  .array(
    z
      .object({
        key: z.string().describe("Unique tab key."),
        value: z.string().describe("Tab display name."),
        hidden: z.boolean().nullable().describe("Whether the tab is hidden. Nullable; stored dashboards may carry null.").optional(),
      })
      .passthrough()
  )
  .describe('Dashboard tabs. Keys must be unique. E.g: [{ "key": "overview", "value": "Overview" }]');

const arrangementSchema = z
  .array(
    z.object({
      widget_id: resourceIdSchema("widget ID"),
      x: z.number().describe("Column position (grid units)."),
      y: z.number().describe("Row position (grid units)."),
      width: z.number().describe("Width in grid units."),
      height: z.number().describe("Height in grid units."),
      tab: z.string().nullable().describe("Tab key the widget is placed on. Nullable; stored arrangements may carry null.").optional(),
    })
  )
  .describe("Widget placement grid. Replaces the current arrangement atomically; always send the complete desired arrangement.");

const DASHBOARD_SCHEMA_HINT = "get_dashboard on an existing dashboard as a reference";

export { arrangementSchema, DASHBOARD_SCHEMA_HINT, tabsSchema };
