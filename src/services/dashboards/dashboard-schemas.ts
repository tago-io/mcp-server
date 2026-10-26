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

// A blueprint dashboard holds at most 20 slots.
const MAX_BLUEPRINT_SLOTS = 20;

const blueprintSlotSchema = z
  .object({
    id: resourceIdSchema("blueprint slot ID").describe("ID of an existing slot, as get_dashboard returns it. Omit for a new slot; the API assigns one.").optional(),
    type: z.enum(["device", "entity"]).describe("What the slot resolves to: a device (default) or an entity.").optional(),
    name: z.string().min(1).describe("Slot identifier. Widgets bind to the slot ID; filter_conditions of other slots refer to this name."),
    label: z.string().nullable().describe("Selector label shown to the dashboard viewer.").optional(),
    conditions: z
      .array(z.object({ key: z.string(), value: z.string() }).strict())
      .describe("Tags a device or entity must carry to appear in this slot's selector, e.g. [{ key: 'entity_type', value: 'organization' }]."),
    filter_conditions: z
      .array(
        z
          .object({
            type: z.literal("tag_match"),
            tag_key: z.string().describe("Tag key compared on both sides."),
            blueprint_device: z.string().describe("Name of the other slot whose selection drives this one."),
          })
          .strict()
      )
      .describe("Narrows this slot to resources whose tag_key value equals the same tag on the resource selected in another slot.")
      .optional(),
    description: z.string().nullable().optional(),
    placeholder: z.string().nullable().optional(),
    tag_to_replace: z.string().nullable().optional(),
    use_item_label_tag: z.boolean().nullable().optional(),
    hide_when_empty: z.boolean().nullable().optional(),
  })
  .strict();

const blueprintSlotsSchema = z
  .array(blueprintSlotSchema)
  .max(MAX_BLUEPRINT_SLOTS)
  .describe(
    `Blueprint slots (at most ${MAX_BLUEPRINT_SLOTS}). Replaces the current slots entirely: read them with get_dashboard and resend every slot to keep exactly as returned, changing only what you intend. A field left out of a kept slot is cleared, so resend type "entity" on entity slots, and widgets bound to a dropped slot lose their data source.`
  );

const blueprintFieldsSchema = {
  blueprint_devices: blueprintSlotsSchema.optional(),
  blueprint_device_behavior: z
    .enum(["always", "more_than_one"])
    .describe('When the slot selectors appear: "always", or "more_than_one" to show a selector only when it has more than one option.')
    .optional(),
  blueprint_selector_behavior: z.enum(["open", "closed", "always_open", "always_closed"]).describe("How the slot selector starts and whether the viewer can toggle it.").optional(),
  disable_blueprint_fallback: z.boolean().describe("Whether to disable the fallback selection when no resource is chosen.").optional(),
};

const BLUEPRINT_FIELDS = Object.keys(blueprintFieldsSchema);

const DASHBOARD_SCHEMA_HINT = "get_dashboard on an existing dashboard as a reference";

export { BLUEPRINT_FIELDS, blueprintFieldsSchema, arrangementSchema, DASHBOARD_SCHEMA_HINT, tabsSchema };
