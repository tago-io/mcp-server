import { z } from "zod";

import { queryModel, tagsObjectModel } from "../../utils/global-params.model";

const analysisListModel = {
  ...queryModel,
  filter: z
    .object({
      name: z.string().describe("Filter by name. E.g: 'Analysis Test'").optional(),
      runtime: z.enum(["node", "python"]).describe("Filter by runtime. E.g: 'node' or 'python'").optional(),
      run_on: z.enum(["tago", "external"]).describe("Filter by run on. E.g: 'tago' or 'external'").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'analysis_type', value: 'invoice' }]").optional(),
    })
    .describe("Filter object to apply to the query. Available filters: name, active, run_on, last_run, created_at, tags")
    .optional(),
  fields: z
    .array(z.enum(["id", "active", "name", "description", "created_at", "updated_at", "last_run", "variables", "tags", "run_on", "version"]))
    .describe(
      "Specific fields to include in the analysis list response. Available fields: id, active, name, description, created_at, updated_at, last_run, variables, tags, run_on, version"
    )
    .optional(),
};

export { analysisListModel };
