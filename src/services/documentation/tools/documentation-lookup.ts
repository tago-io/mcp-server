import { z } from "zod";
import { IDeviceToolConfig } from "../../types";
import { ENV } from "../../../utils/get-env-variables";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { Resources } from "@tago-io/sdk";

// Base schema without refinement - this provides the .shape property needed by MCP
const documentationBaseSchema = z
  .object({
    // Separate fields for different operations to maintain type safety
    search: z.array(z.string()).min(1).max(5).describe("The questions to search for documentation. This list should contain at least 1 question and maximum 5 questions."),
  })
  .describe("Schema for the documentation operation");

type DocumentationSchema = z.infer<typeof documentationBaseSchema>;

async function documentationSearchTool(_resources: Resources, params: DocumentationSchema): Promise<string> {
  const { search } = params;

  let token = "test";
  if (!process.env.TEST) {
    token = ENV.TAGOIO_TOKEN;
  }
  const api = "https://api.ai.tago.io";

  const response = await fetch(`${api}/rag/documentation`, {
    method: "POST",
    headers: {
      Authorization: `${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      search,
    }),
  });

  const data = await response.json();
  const markdownResponse = convertJSONToMarkdown(data);
  return markdownResponse;
}

const documentationConfigJSON: IDeviceToolConfig = {
  name: "tagoio-documentation-search",
  description: `
        Ground your answer into TagoIO Documentation. Use it to get links and content of relevant documentation. Accepts multiple search queries with automatic deduplication.

        When to use this tool:
        - When questions relate to TagoIO platform features, APIs, widgets, or configurations
        - To get relevant articles and documentation links related to user question
        - When user asks about TagoIO-specific concepts or implementation details

        Search strategy:
        - Provide an array of precise, targeted search terms for specific features
        - For conceptual questions, include both the concept and relevant TagoIO terms
        - Use multiple focused queries for comprehensive searches (e.g., ["widgets configuration", "dashboard setup", "data visualization"])
        - If initial results aren't helpful, try reformulating with different keywords
        - Consider breaking complex questions into multiple focused searches

        <example>
          {
            "search": ["How to configure a dashboard?", "How to configure a widget?"]
          }
        </example>
        Current Date: ${new Date().toLocaleDateString()}
  `,
  parameters: documentationBaseSchema.shape,
  title: "Documentation Search",
  tool: documentationSearchTool,
};

export { documentationConfigJSON };
export { documentationBaseSchema }; //export for testing purposes
