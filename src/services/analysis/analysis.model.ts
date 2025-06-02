import z from "zod";

const analysisListModel = {
  amount: z.number().max(200).optional(),
  fields: z.array(z.enum(["id", "active", "name", "description", "created_at", "updated_at", "last_run", "variables", "tags", "run_on", "version"])).optional(),
};

export { analysisListModel };
