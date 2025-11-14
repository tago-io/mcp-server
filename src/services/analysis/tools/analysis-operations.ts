import { z } from "zod/v3";
import { AnalysisQuery, Resources } from "@tago-io/sdk";
import { IDeviceToolConfig } from "../../types";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { querySchema, tagsObjectModel } from "../../../utils/global-params.model";
import { createOperationFactory } from "../../../utils/operation-factory";

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
      runtime: z.enum(["node", "python"]).default("node").describe("Filter by runtime. E.g: 'node' or 'python'").optional(),
      run_on: z.enum(["tago", "external"]).default("tago").describe("Filter by run on. E.g: 'tago' or 'external'").optional(),
      tags: z.array(tagsObjectModel).describe("Filter by tags. E.g: [{ key: 'analysis_type', value: 'invoice' }]").optional(),
      include_console: z.boolean().default(false).describe("Whether to include the console log of the analysis when it's running on TagoIO platform.").optional(),
      updated_at: z.string().describe("Filter by updated at. E.g: '2021-01-01'").optional(),
      created_at: z.string().describe("Filter by created at. E.g: '2021-01-01'").optional(),
      orderBy: z.string().default("name,asc").describe("Sort by field and order. E.g: 'name,asc' or 'name,desc'").optional(),
    })
    .describe("Filter object to apply to the query.")
    .optional(),
});

// Base schema without refinement - this provides the .shape property needed by MCP
const analysisBaseSchema = z
  .object({
    operation: z.enum(["lookup"]).describe("The type of operation to perform on the analysis."),
    analysisID: z.string().describe("Optional. The ID of the analysis to perform the operation on.").optional(),
    // Separate fields for different operations to maintain type safety
    lookupAnalysis: analysisListSchema.describe("The analysis to be listed. Required for lookup operations.").optional(),
  })
  .describe("Schema for the analysis operation. The delete operation only requires the analysisID.");

//TODO: add refine for create and update operations
const analysisSchema = analysisBaseSchema.refine(
  () => {
    // list and info operations are valid with or without query
    return true;
  },
  {
    message: "Invalid data structure for the specified operation. Create requires createAnalysis, update requires updateAnalysis.",
  }
);

type AnalysisSchema = z.infer<typeof analysisSchema>;

function validateAnalysisQuery(query: any): AnalysisQuery | undefined {
  if (!query) {
    return undefined;
  }

  const amount = query.amount || 200;
  let fields: AnalysisQuery["fields"] = query.fields || ["id", "active", "name", "created_at", "updated_at", "last_triggered", "tags", "type", "action", "variables", "run_on"];

  if (query.include_console) {
    fields = (fields || []).concat(["console"]);
  }

  return {
    amount,
    fields,
    ...query,
  };
}

// Operation handlers
async function handleLookupOperation(resources: Resources, params: AnalysisSchema): Promise<string> {
  const { analysisID, lookupAnalysis } = params;

  if (analysisID) {
    const result = await resources.analysis.info(analysisID);
    return convertJSONToMarkdown(result);
  }

  const validatedQuery = validateAnalysisQuery(lookupAnalysis);
  const analyses = await resources.analysis.list(validatedQuery).catch((error) => {
    throw `**Error fetching analyses:** ${(error as Error)?.message || error}`;
  });

  return convertJSONToMarkdown(analyses);
}

/**
 * @description Performs analysis operations and returns a Markdown-formatted response.
 */
async function analysisOperationsTool(resources: Resources, params: AnalysisSchema) {
  const validatedParams = analysisSchema.parse(params);

  const factory = createOperationFactory<AnalysisSchema>().register("lookup", (params) => handleLookupOperation(resources, params));

  return factory.execute(validatedParams);
}

const analysisOperationsConfigJSON: IDeviceToolConfig = {
  name: "analysis-lookup",
  description: `The AnalysisLookup tool searches and retrieves analysis information from the TagoIO platform. Analyses are serverless code execution environments that run custom scripts and logic for data processing, platform automation, and business rule implementation within TagoIO's cloud infrastructure.

Use this tool when you need to find specific analyses by name or properties, retrieve analysis configurations and settings, discover available analyses in your TagoIO environment, or obtain analysis details for integration workflows.

The operation parameter must be set to "lookup". When you have an exact analysis identifier, provide analysisID for direct retrieval. For broader searches, use lookupAnalysis with amount (maximum number of results to return) and filter (search criteria object)

Critical restriction: never include include_console in operations unless specifically querying for console-related inquiries.
  
<example>
  {
    "operation": "lookup",
    "lookupAnalysis": {
      "amount": 100,
      "filter": {
        "name": "invoice",
        "runtime": "node",
        "run_on": "tago",
        "tags": [{ "key": "analysis_type", "value": "invoice" }]
      }
    }
  }
</example>`,
  parameters: analysisBaseSchema.shape,
  title: "Analyses Operations",
  tool: analysisOperationsTool,
};

export { analysisOperationsConfigJSON };
export { analysisBaseSchema }; // export for testing purposes
