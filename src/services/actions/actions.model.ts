import z from "zod";

const actionListModel = {
  amount: z.number().max(200).optional(),
  fields: z.array(z.enum(["id", "active", "name", "description", "created_at", "updated_at", "last_triggered", "tags", "type", "action"])).optional(),
};

export { actionListModel };
