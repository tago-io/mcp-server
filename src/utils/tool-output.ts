import { convertJSONToMarkdown } from "./markdown";

type ResponseFormat = "concise" | "detailed";

interface RenderListOptions {
  items: Record<string, unknown>[];
  /** Keys kept in concise mode (missing keys are skipped per item). */
  conciseFields: string[];
  /** When present, concise mode renders exactly these fields instead of the concise defaults: fields shapes the output, not just the API query. Detailed mode is unaffected. */
  selectedFields?: string[];
  responseFormat?: ResponseFormat;
  /** Requested amount, used to detect a possibly truncated (full) page. */
  requestedAmount: number;
  page?: number;
  /** Plural resource label for counts, e.g. "devices". */
  resourceLabel: string;
  emptyHint?: string;
}

function pickFields(item: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in item) {
      picked[field] = item[field];
    }
  }
  return picked;
}

/** A full page gets a steering line so agents know more may exist and how to get it. */
function renderList(options: RenderListOptions): string {
  const { items, conciseFields, selectedFields, responseFormat, requestedAmount, page, resourceLabel, emptyHint } = options;

  if (items.length === 0) {
    const hint = emptyHint ?? "Broaden or remove filters and try again.";
    return `No ${resourceLabel} found. ${hint}`;
  }

  const conciseKeys = selectedFields && selectedFields.length > 0 ? selectedFields : conciseFields;
  const shaped = responseFormat === "detailed" ? items : items.map((item) => pickFields(item, conciseKeys));
  const lines = [convertJSONToMarkdown(shaped), "", `${items.length} ${resourceLabel}${page ? ` (page ${page})` : ""}.`];

  if (items.length >= requestedAmount) {
    const nextPage = (page ?? 1) + 1;
    lines.push(`This page is full, so more may exist; request page ${nextPage} or narrow the filter. Use response_format: "detailed" for all fields.`);
  } else if (responseFormat !== "detailed") {
    lines.push(`Concise view. Use response_format: "detailed" for all fields.`);
  }

  return lines.join("\n");
}

function renderItem(item: Record<string, unknown>, conciseFields: string[], responseFormat?: ResponseFormat): string {
  if (responseFormat === "detailed") {
    return convertJSONToMarkdown(item);
  }
  const rendered = convertJSONToMarkdown(pickFields(item, conciseFields));
  return `${rendered}\n\nConcise view. Use response_format: "detailed" for all fields.`;
}

export { RenderListOptions, ResponseFormat, renderItem, renderList };
