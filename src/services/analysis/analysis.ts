import { Resources } from "@tago-io/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { AnalysisQuery } from "@tago-io/sdk/lib/modules/Resources/analysis.types";

import { toMarkdown } from "../../utils/markdown";
import { analysisListModel } from "./analysis.model";
import { genericIDModel } from "../../utils/global-params.model";

/**
 * @description Fetches analyses from the account, applies deterministic filters if provided, and returns a Markdown-formatted response.
 */
async function _getAnalyses(resources: Resources, query?: AnalysisQuery) {
  const amount = query?.amount || 200;
  const fields = query?.fields || ["id", "active", "name", "description", "created_at", "updated_at", "last_run", "variables", "tags", "run_on", "version"];

  const analyses = await resources.analysis
    .list({
      amount,
      fields,
      ...query,
    })
    .catch((error) => {
      throw `**Error fetching analyses:** ${error}`;
    });

  const markdownResponse = toMarkdown(analyses);

  return markdownResponse;
}

/**
 * @description Get an analysis by its ID and returns a Markdown-formatted response.
 */
async function _getAnalysisByID(resources: Resources, analysisID: string) {
  const analysis = await resources.analysis.info(analysisID).catch((error) => {
    throw `**Error to get analysis by ID:** ${error}`;
  });

  const markdownResponse = toMarkdown(analysis);

  return markdownResponse;
}

/**
 * @description Handler for analyses tools to register tools in the MCP server.
 */
async function handlerAnalysesTools(server: McpServer, resources: Resources) {
  server.tool("list-analyses", "List all analyses", analysisListModel, { title: "List Analyses" }, async (params) => {
    const result = await _getAnalyses(resources, params);
    return { content: [{ type: "text", text: result }] };
  });

  server.tool("get-analysis-by-id", "Get an analysis by its ID", genericIDModel, { title: "Get Analysis by ID" }, async (params) => {
    const result = await _getAnalysisByID(resources, params.id);
    return { content: [{ type: "text", text: result }] };
  });
}

export { handlerAnalysesTools };
