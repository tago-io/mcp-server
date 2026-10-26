import type { SQLExecuteResult } from "@tago-io/sdk";

import { escapeTableCell, truncateUtf8 } from "../../utils/text-budget";

// A result can hold the plan's full row cap of wide rows; the rendered table
// stays within the same budget as the other large outputs in this server.
const MAX_RESPONSE_BYTES = 32 * 1024;
const MAX_CELL_BYTES = 512;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return truncateUtf8(escapeTableCell(text), MAX_CELL_BYTES);
}

function summaryLine(result: SQLExecuteResult): string {
  const source = result.served_from_cache ? "served from cache (no Data Output used)" : "executed fresh (counts against Data Output)";
  return `${result.row_count} row(s) in ${result.execution_ms} ms, ${source}.`;
}

const omissionNote = (shown: number, total: number) =>
  `\nShowing ${shown} of ${total} rows to stay within ${MAX_RESPONSE_BYTES} bytes. Narrow the query: a smaller LIMIT with a parameter cursor (e.g. WHERE time < $1), fewer columns, or after_device for fleet queries.`;

/** Renders rows in column order while they fit the byte budget; the caller compares the count to detect a cut. */
function fitRows(rows: SQLExecuteResult["rows"], names: string[], budget: number): string[] {
  const fitted: string[] = [];
  let remaining = budget;
  for (const row of rows) {
    const line = `| ${names.map((name) => formatCell(row[name])).join(" | ")} |`;
    const lineBytes = Buffer.byteLength(line, "utf8") + 1;
    if (lineBytes > remaining) {
      break;
    }
    fitted.push(line);
    remaining -= lineBytes;
  }
  return fitted;
}

function renderTable(summary: string, result: SQLExecuteResult): string {
  const names = result.columns.map((column) => column.name);
  const header = `| ${result.columns.map((column) => `${escapeTableCell(column.name)} (${column.type})`).join(" | ")} |`;
  const separator = `| ${names.map(() => "---").join(" | ")} |`;
  const lines = [summary, "", header, separator];

  const budget = MAX_RESPONSE_BYTES - Buffer.byteLength(lines.join("\n"), "utf8") - Buffer.byteLength(omissionNote(result.rows.length, result.rows.length), "utf8");
  const rows = fitRows(result.rows, names, budget);
  const output = [...lines, ...rows].join("\n");
  return rows.length < result.rows.length ? `${output}\n${omissionNote(rows.length, result.rows.length)}` : output;
}

function renderExecution(result: SQLExecuteResult): string {
  const summary = summaryLine(result);
  if (result.columns.length === 0) {
    return `${summary}\nNo columns and no rows: nothing matched. A session-context query whose session resolves to no data returns this instead of an error.`;
  }
  return renderTable(summary, result);
}

export { MAX_RESPONSE_BYTES, renderExecution };
