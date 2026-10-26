import type { SQLTablesQuery, SQLTablesResult } from "@tago-io/sdk";
import { z } from "zod/v3";

import { pageSchema, resourceIdSchema } from "../../../utils/global-params.model";
import { pickDefined } from "../../../utils/pick-defined";
import { escapeTableCell } from "../../../utils/text-budget";
import { IToolConfig, ServerContext } from "../../types";

const lookupSqlTablesSchema = {
  filter: z.string().min(1).describe("Substring match on device and entity names, to find the IDs to put in device('id') or entity('id').").optional(),
  entity_id: resourceIdSchema("entity ID").describe("Resolve the columns of one entity you own; entity tables expose that entity's own schema fields.").optional(),
  amount: z.number().int().min(1).max(100).describe("Devices and entities to list (1-100, default 20).").optional(),
  page: pageSchema,
};

type LookupSqlTablesParams = z.infer<z.ZodObject<typeof lookupSqlTablesSchema>>;

const DEFAULT_AMOUNT = 20;

const cell = (value: unknown) => escapeTableCell(value === undefined || value === null ? "" : String(value));

function renderTables(tables: SQLTablesResult["tables"]): string[] {
  const lines = ["### Table functions", "", "| function | tag form | label | columns |", "| --- | --- | --- | --- |"];
  for (const table of tables) {
    // A per-entity table has no fixed columns until entity_id names the entity.
    const columns = table.columns.length === 0 && table.dynamic ? "per entity; pass entity_id" : table.columns.map((column) => `${column.name}:${column.type}`).join(", ");
    lines.push(`| ${cell(table.function)} | ${cell(table.tag_form)} | ${cell(table.label)} | ${cell(columns)} |`);
  }
  return lines;
}

/** `nextPage` is set when the page came back full, so more resources may exist. */
function renderResources(kind: string, items: Array<{ id: string; name: string }>, nextPage?: number): string[] {
  if (items.length === 0) {
    return [`### ${kind}`, "", "_None matched._"];
  }
  const lines = [`### ${kind}`, "", "| id | name |", "| --- | --- |", ...items.map((item) => `| ${cell(item.id)} | ${cell(item.name)} |`)];
  if (nextPage !== undefined) {
    lines.push("", `This page is full, so more ${kind.toLowerCase()} may exist; request page ${nextPage} or narrow \`filter\`.`);
  }
  return lines;
}

function renderFunctions(functions: SQLTablesResult["functions"]): string[] {
  const lines = ["### Functions", "", "| name | kind | args | description | example |", "| --- | --- | --- | --- | --- |"];
  for (const fn of functions) {
    lines.push(`| ${cell(fn.name)} | ${cell(fn.kind)} | ${cell(fn.args.join(", "))} | ${cell(fn.description)} | ${cell(fn.example)} |`);
  }
  return lines;
}

async function lookupSqlTablesTool(context: ServerContext, params: LookupSqlTablesParams): Promise<string> {
  const catalog = await context.resources.sql.tables(pickDefined(params) as SQLTablesQuery);
  const amount = params.amount ?? DEFAULT_AMOUNT;
  const nextPage = (count: number) => (count >= amount ? (params.page ?? 1) + 1 : undefined);
  const devices = catalog.resources?.devices ?? [];
  const entities = catalog.resources?.entities ?? [];
  return [
    ...renderTables(catalog.tables),
    "",
    ...renderResources("Devices", devices, nextPage(devices.length)),
    "",
    ...renderResources("Entities", entities, nextPage(entities.length)),
    "",
    ...renderFunctions(catalog.functions ?? []),
  ].join("\n");
}

const lookupSqlTablesConfigJSON: IToolConfig = {
  name: "lookup_sql_tables",
  description: `Lists what a TagoSQL query can read: the table functions with their typed columns, your devices and entities with their IDs, and the callable functions (aggregates and session functions).

Use before writing or fixing a query with create_sql_query or update_sql_query, so the table functions, column names, and IDs are real rather than guessed. Data tables (device, entity, device_data_by_tag) return one row per stored data point; list tables (devices, entities) one row per resource. Every FROM table needs an alias. device_tag and entity_tag read the FIRST resource matching the tag (lowest ID); devices_tag and entities_tag list EVERY match; device_data_by_tag returns the latest reading of every matching device and requires a variable = '...' filter and a recent time bound.

<example>
{"filter": "compressor", "amount": 20}
</example>

Key limitations: \`filter\` matches device and entity names only; pass \`entity_id\` to see one entity's columns, which come from its own schema; with an analysis token, this needs any \`sql\` action in a policy.`,
  parameters: lookupSqlTablesSchema,
  title: "Lookup SQL Tables",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: lookupSqlTablesTool,
};

export { lookupSqlTablesConfigJSON };
