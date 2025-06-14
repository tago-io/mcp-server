import z from "zod/v3";

const genericIDSchema = {
  id: z.string({ message: "ID is required" }).describe("ID used on TagoIO, string with 24 characters").length(24, "ID must be 24 characters long"),
};

const querySchema = {
  page: z.number().min(1).describe("Page of list starting from 1 (min: 1)").optional(),
  amount: z.number().min(1).max(10000).describe("Amount of items will return (max: 10000, min: 1)").optional(),
  fields: z.array(z.string()).describe("Array of field names to include in the response.").optional(),
  filter: z.record(z.string(), z.unknown()).describe("Filter object to apply to the query. E.g: { name: 'John' }").optional(),
  // TODO: Add orderBy field
};

const tagsObjectModel = z.object({
  key: z.string().describe("Tag key"),
  value: z.string().describe("Tag value"),
});

export { genericIDSchema, querySchema, tagsObjectModel };
