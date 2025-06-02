import z from "zod";

const idModel = { id: z.string({ required_error: "ID is required" }).length(24, "ID must be 24 characters long") };

export { idModel };
