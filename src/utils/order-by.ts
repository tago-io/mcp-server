import { invalidParamError } from "./tool-errors";

/** Parses the public "field,direction" string into the SDK's top-level [field, "asc" | "desc"] tuple (Query<T, U> in @tago-io/sdk). */
function parseOrderBy<Field extends string>(input: string, allowedFields: readonly Field[]): [Field, "asc" | "desc"] {
  const parts = input.split(",").map((part) => part.trim());
  const [field, direction] = parts;
  const validField = allowedFields.includes(field as Field);
  if (parts.length !== 2 || !validField || (direction !== "asc" && direction !== "desc")) {
    throw invalidParamError("filter.orderBy", `must be "field,direction" with field one of ${allowedFields.join(", ")} and direction asc or desc`, `"${allowedFields[0]},asc"`);
  }
  return [field as Field, direction];
}

export { parseOrderBy };
