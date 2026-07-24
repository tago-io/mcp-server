import type { AnalysisQuery } from "@tago-io/sdk";
import { z } from "zod/v3";

import { amountSchema, pageSchema, responseFormatSchema, tagsObjectModel, wildcardFilter } from "../../../utils/global-params.model";
import { parseOrderBy } from "../../../utils/order-by";
import { renderList } from "../../../utils/tool-output";
import { IToolConfig, ServerContext } from "../../types";
import { ANALYSIS_RUNTIME_VALUES } from "../runtime-policy";
import { projectAnalysis } from "../safe-projection";

// `variables` is requested from the API by default so safe-projection can emit
// `environment_variable_keys`, but it is not selectable: the projection never
// keeps a `variables` key (values are stripped), so `fields: ["variables"]`
// could never render that column.
const DEFAULT_QUERY_FIELDS = ["id", "active", "name", "created_at", "updated_at", "last_run", "tags", "runtime", "variables", "run_on"] as const;
const SELECTABLE_FIELDS = ["id", "active", "name", "created_at", "updated_at", "last_run", "tags", "runtime", "run_on"] as const;
const ORDER_FIELDS = ["name", "active", "run_on", "last_run", "created_at", "updated_at"] as const;
const DEFAULT_AMOUNT = 20;

const searchAnalysesSchema = {
  filter: z
    .object({
      name: z.string().describe("Partial analysis name. Wildcard matching is applied automatically ('invoice' finds 'Invoice Analysis').").optional(),
      runtime: z.enum(ANALYSIS_RUNTIME_VALUES).describe("Filter by runtime.").optional(),
      run_on: z.enum(["tago", "external"]).describe("Filter by where the analysis runs.").optional(),
      tags: z.array(tagsObjectModel.partial()).describe("Filter by tags. E.g: [{ key: 'analysis_type', value: 'invoice' }]").optional(),
      created_at: z.string().describe("Filter by creation date. E.g: '2026-01-01'").optional(),
      updated_at: z.string().describe("Filter by update date. E.g: '2026-01-01'").optional(),
      orderBy: z
        .string()
        .describe(`Sort as "field,direction". Field is one of: ${ORDER_FIELDS.join(", ")}; direction is asc or desc. E.g: "name,asc"`)
        .optional(),
    })
    .describe("Filters to narrow the search.")
    .optional(),
  page: pageSchema,
  amount: amountSchema(200, DEFAULT_AMOUNT),
  fields: z
    .array(z.enum(SELECTABLE_FIELDS))
    .describe(
      "Fields to include per analysis. Defaults to all key fields. Also controls the rendered columns: when supplied, output shows exactly these fields, even in concise mode. Environment variables are not selectable here; environment_variable_keys appears in detailed responses when no explicit fields are given."
    )
    .optional(),
  response_format: responseFormatSchema,
};

type SearchAnalysesParams = z.infer<z.ZodObject<typeof searchAnalysesSchema>>;

async function searchAnalysesTool(context: ServerContext, params: SearchAnalysesParams): Promise<string> {
  const amount = params.amount ?? DEFAULT_AMOUNT;
  const fields = params.fields ?? [...DEFAULT_QUERY_FIELDS];
  const query: AnalysisQuery = {
    amount,
    page: params.page,
    fields: fields as AnalysisQuery["fields"],
  };
  if (params.filter) {
    const { orderBy, ...filterFields } = params.filter;
    query.filter = wildcardFilter(filterFields, ["name"]) as AnalysisQuery["filter"];
    if (orderBy) {
      query.orderBy = parseOrderBy(orderBy, ORDER_FIELDS);
    }
  }

  const analyses = await context.resources.analysis.list(query);
  return renderList({
    items: analyses.map((analysis) => projectAnalysis(analysis as unknown as Record<string, unknown>)),
    conciseFields: ["id", "name", "runtime", "active", "run_on", "last_run"],
    selectedFields: params.fields,
    responseFormat: params.response_format,
    requestedAmount: amount,
    page: params.page,
    resourceLabel: "analyses",
    emptyHint: "Broaden the name filter (wildcards are automatic) or drop filters.",
  });
}

const searchAnalysesConfigJSON: IToolConfig = {
  name: "search_analyses",
  description: `Searches the analyses (serverless scripts that run custom logic) in the TagoIO account by name, runtime, run location, or tags.

Use when you need to find analyses, list what exists, or resolve an analysis name to its ID before calling get_analysis. Name filtering is wildcard-based, so partial names work. Returns a concise table by default; a full page means more results may exist (paginate or narrow).

<example>
{"filter": {"name": "invoice", "runtime": "node-rt2025"}, "amount": 20}
</example>`,
  parameters: searchAnalysesSchema,
  title: "Search Analyses",
  annotations: { readOnlyHint: true, openWorldHint: false },
  mutationClass: "read",
  tool: searchAnalysesTool,
};

export { searchAnalysesConfigJSON };
