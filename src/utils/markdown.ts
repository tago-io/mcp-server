/**
 * Converts a value (object, array, or primitive) to a human-readable Markdown string.
 *
 * - Arrays of objects are rendered as Markdown tables.
 * - Regular arrays are displayed as tables.
 * - Objects are rendered with nested tables.
 * - Primitives are rendered as strings.
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
    return objectToNestedMarkdown(data as Record<string, unknown>);
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
 * Converts a regular array to a markdown table with index and value columns.
 *
 * @param arr - The array to convert
 * @returns The markdown table string
 */
function regularArrayToTable(arr: unknown[]): string {
  const header = "| Index | Value |";
  const separator = "| --- | ----- |";
  const rows = arr.map((value, index) => `| ${index} | ${valueToMarkdownCell(value)} |`);

  return [header, separator, ...rows].join("\n");
}

/**
 * Determines if an array contains objects with a consistent structure
 * that should be displayed as a table with columns for each property.
 *
 * @param arr - The array to check
 * @returns true if the array should be displayed as a property table
 */
function isStructuredObjectArray(arr: unknown[]): boolean {
  if (arr.length === 0 || !arr.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))) {
    return false;
  }

  // All items are objects, check if they have a consistent structure
  // We'll consider it consistent if most objects share the same keys
  const objects = arr as Record<string, unknown>[];
  const allKeys = objects.reduce((keys, obj) => {
    for (const k of Object.keys(obj)) {
      keys.add(k);
    }
    return keys;
  }, new Set<string>());

  // For small arrays or if we have only a few properties, require all objects to have the same structure
  if (arr.length <= 3 || allKeys.size <= 3) {
    return objects.every((obj) => {
      return Array.from(allKeys).every((key) => key in obj);
    });
  }

  // For larger arrays, check if at least 75% of objects have each key
  const threshold = Math.ceil(arr.length * 0.75);
  return Array.from(allKeys).every((key) => {
    const objectsWithKey = objects.filter((obj) => key in obj).length;
    return objectsWithKey >= threshold;
  });
}

/**
 * Converts an object to a Markdown with nested tables for object properties.
 *
 * @param obj - The object to convert.
 * @returns The Markdown formatted string.
 */
function objectToNestedMarkdown(obj: Record<string, unknown>): string {
  const result: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      // Format nested object as a table
      result.push(`### ${key}:\n`);
      result.push(objectToKeyValueTable(value as Record<string, unknown>));
      result.push(""); // Add empty line after table
    } else if (Array.isArray(value)) {
      // Handle arrays as tables
      result.push(`### ${key}:\n`);

      if (value.length === 0) {
        result.push("_No items_");
      } else if (isStructuredObjectArray(value)) {
        // If array contains objects with consistent structure, use property columns
        result.push(arrayToMarkdownTable(value as Record<string, unknown>[]));
      } else {
        // Otherwise use index/value format
        result.push(regularArrayToTable(value));
      }

      result.push(""); // Add empty line after table
    } else {
      // Handle primitives and Date objects
      result.push(`**${key}**: ${valueToMarkdownCell(value)}\n`);
    }
  }

  return result.join("\n");
}

/**
 * Converts an object to a two-column key-value Markdown table.
 *
 * @param obj - The object to convert.
 * @returns The Markdown table string.
 */
function objectToKeyValueTable(obj: Record<string, unknown>): string {
  const header = "| Key | Value |";
  const separator = "| --- | ----- |";
  const rows = Object.entries(obj).map(([key, value]) => `| ${key} | ${valueToMarkdownCell(value)} |`);

  return [header, separator, ...rows].join("\n");
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
