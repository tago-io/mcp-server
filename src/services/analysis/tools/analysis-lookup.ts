import { z } from "zod/v3";
import { Resources } from "@tago-io/sdk";

import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema, tagsObjectModel } from "../../../utils/global-params.model";

const analysisListSchema = querySchema.extend({
  filter: z
    .object({
      name: z
        .string()
        .describe(`
          The name filter uses wildcard matching, so do not need to specify the exact analysis name.
          For example, searching for "invoice" finds analyses like "Invoice Analysis" and "Invoice Analysis 2".
        `)
        .transform((val) => `*${val}*`)
        .optional(),
      runtime: z.enum(["node", "python"]).describe("Filter by runtime. E.g: 'node' or 'python'").optional(),
      run_on: z.enum(["tago", "external"]).describe("Filter by run on. E.g: 'tago' or 'external'").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'analysis_type', value: 'invoice' }]").optional(),
    })
    .describe("Filter object to apply to the query. Available filters: name, active, run_on, last_run, created_at, tags")
    .optional(),
  fields: z
    .array(z.enum(["id", "active", "name", "created_at", "updated_at", "last_run", "variables", "tags", "run_on", "version"]))
    .describe(
      "Specific fields to include in the analysis list response. Available fields: id, active, name, created_at, updated_at, last_run, variables, tags, run_on, version, code.\nOnly request code if you need to see the analysis content."
    )
    .optional(),
});

type AnalysisSchema = z.infer<typeof analysisListSchema>;

/**
 * @description Fetches analyses from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function analysisLookupTool(resources: Resources, query?: AnalysisSchema) {
  const amount = query?.amount || 200;
  const fields = query?.fields || ["id", "active", "name", "created_at", "updated_at", "last_run", "variables", "tags", "run_on", "version"];

  const analyses = await resources.analysis
    .list({
      amount,
      fields,
      ...query,
    })
    .catch((error) => {
      throw new Error(`Error fetching analyses: ${error}`);
    });

  const markdownResponse = convertJSONToMarkdown(analyses);

  return markdownResponse;
}

const analysisLookupConfigJSON: IDeviceToolConfig = {
  name: "analysis-lookup",
  description: "Get a list of analyses.",
  parameters: analysisListSchema.shape,
  title: "Get Analysis List",
  tool: analysisLookupTool,
};

export { analysisLookupConfigJSON };
export { analysisListSchema }; // export for testing purposes
