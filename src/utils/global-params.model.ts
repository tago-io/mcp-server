import { z } from "zod/v3";

const genericIDSchema = z.object({
  id: z.string({ message: "ID is required" }).describe("ID used on TagoIO, string with 24 characters").length(24, "ID must be 24 characters long"),
});

const querySchema = z.object({
  page: z.number().min(1).describe("Page of list starting from 1 (min: 1)").optional(),
  amount: z.number().min(1).max(10000).describe("Amount of items will return (max: 10000, min: 1)").optional(),
  fields: z.array(z.string()).describe("Array of field names to include in the response.").optional(),
  filter: z.record(z.string(), z.unknown()).describe("Filter object to apply to the query. E.g: { name: 'John' }").optional(),
});

const tagsObjectModel = z.object({
  key: z.string().describe("Tag key"),
  value: z.string().describe("Tag value"),
});

/** Wildcard-wrapping ("value" -> "*value*") happens when building the SDK query, never in the input schema, so repeated schema validation cannot wrap a value twice. */
function wildcardFilter<T extends Record<string, unknown> | undefined>(filter: T, keys: string[]): T {
  if (!filter) {
    return filter;
  }

  const wrapped: Record<string, unknown> = { ...filter };
  for (const key of keys) {
    const value = wrapped[key];
    if (typeof value === "string" && value.length > 0) {
      wrapped[key] = `*${value}*`;
    }
  }
  return wrapped as T;
}

const responseFormatSchema = z
  .enum(["concise", "detailed"])
  .describe("Response verbosity. 'concise' (default) returns key identity fields; 'detailed' returns every field.")
  .optional();

const pageSchema = z.number().int().min(1).describe("Page of results, starting from 1.").optional();

function amountSchema(max: number, defaultAmount: number) {
  return z.number().int().min(1).max(max).describe(`Number of items to return (min 1, max ${max}, default ${defaultAmount}).`).optional();
}

function resourceIdSchema(label: string) {
  return z.string().length(24, `${label} must be a 24-character ID`).describe(`The 24-character ${label}.`);
}

export { amountSchema, genericIDSchema, pageSchema, querySchema, resourceIdSchema, responseFormatSchema, tagsObjectModel, wildcardFilter };
