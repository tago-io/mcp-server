/**
 * Converts a value (object, array, or primitive) to a human-readable Markdown string.
 *
 * - Arrays of objects are rendered as Markdown tables.
 * - Objects are rendered as property lists.
 * - Primitives are rendered as strings.
 * - Nested objects/arrays are stringified as JSON.
 */
export function toMarkdown(data: object | Array<object> | unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return "_No data found._";
    }
    if (data.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))) {
      return arrayToMarkdownTable(data as Record<string, unknown>[]);
    }
    return data.map((item) => `- ${primitiveToString(item)}`).join("\n");
  }
  if (typeof data === "object" && data !== null) {
    return objectToMarkdownList(data as Record<string, unknown>);
  }
  return primitiveToString(data);
}

/**
 * Converts an array of objects to a Markdown table.
 */
function arrayToMarkdownTable(arr: Record<string, unknown>[]): string {
  const columns = Array.from(
    arr.reduce((cols, obj) => {
      for (const k of Object.keys(obj)) {
        cols.add(k);
      }
      return cols;
    }, new Set<string>())
  );
  const header = `| ${columns.join(" | ")} |`;
  const separator = `|${columns.map(() => " --- ").join("|")}|`;
  const rows = arr.map((obj) => `| ${columns.map((col) => valueToMarkdownCell(obj[col])).join(" | ")} |`);
  return [header, separator, ...rows].join("\n");
}

/**
 * Converts an object to a Markdown property list.
 *
 * @param obj - The object to convert.
 * @returns The Markdown list string.
 */
function objectToMarkdownList(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([key, value]) => `- **${key}**: ${valueToMarkdownCell(value)}`)
    .join("\n");
}

/**
 * Converts a value to a Markdown cell string, stringifying objects/arrays as JSON.
 *
 * @param value - The value to convert.
 * @returns The Markdown cell string.
 */
function valueToMarkdownCell(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return "[]";
      }
      // Special handling for tags array
      if (value.every((item) => typeof item === "object" && item !== null && "key" in item && "value" in item)) {
        return `\`${JSON.stringify(value)}\``;
      }
      return `\`${JSON.stringify(value)}\``;
    }
    return `\`${JSON.stringify(value)}\``;
  }
  return primitiveToString(value);
}

/**
 * Converts a primitive value to string for Markdown.
 *
 * @param value - The value to convert.
 * @returns The string representation.
 */
function primitiveToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "_empty_";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}
