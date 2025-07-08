import { z } from "zod/v3";
import { IDeviceToolConfig } from "../../types";
import { ENV } from "../../../utils/get-env-variables";
import { convertJSONToMarkdown } from "../../../utils/markdown";
import { Resources } from "@tago-io/sdk";

// Base schema without refinement - this provides the .shape property needed by MCP
const analysisCodeBaseSchema = z.object({
  // Separate fields for different operations to maintain type safety
  lookupCodeQuestions: z.array(z.string()).min(1).max(5).describe("The questions to search for code. This list should contain at least 1 question and maximum 5 questions."),
  type: z.enum(["analysis", "payload-parser"]).describe("The type of code to search for. This will help the tool to return the correct code examples and SDK methods."),
}).describe("Schema for the analysis operation. The delete operation only requires the analysisID.");

type AnalysisCodeSchema = z.infer<typeof analysisCodeBaseSchema>;

async function analysisCodeSearchTool(_resources: Resources, params: AnalysisCodeSchema): Promise<string> {
  const { lookupCodeQuestions, type } = params;

  let token = "test";
  if (!process.env.TEST) {
    token = ENV.TAGOIO_TOKEN;
  }
  const api = "https://api.ai.tago.io";

  const response = await fetch(`${api}/rag/code`, {
    method: "POST",
    headers: {
      "Authorization": `${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      search: lookupCodeQuestions,
      type: type,
    }),
  });

  const data = await response.json();
  const markdownResponse = convertJSONToMarkdown(data);
  return markdownResponse;
}

const analysisCodeConfigJSON: IDeviceToolConfig = {
  name: "analysis-code-search",
  description: `
        Use this tool to get Analysis or Payload Parser Javascript code examples and SDK methods from TagoIO directly.
        Use search terms according to the task you need to perform. For example, if needing to clean up data in a device search for "Device Data Operations" and "Device Class Resource".
      
        - Analysis serves as the serverless compute layer, executing JavaScript or Python scripts for data processing and automation. 
        Analysis scripts run as single files without package.json or requirements.txt support and can be triggered by Actions, Dashboard interactions, or direct API calls. 
        External libraries require webpack bundling via @tago-io/builder for local development. Native libraries available include luxon, dayjs, lodash, and async.
        - Payload Parsers transform incoming device data through JavaScript decoders, normalizing data before storage. 
        The Entity equivalent is called "Schema Parser" with enhanced transformation capabilities. 
        When asked about Payload Parser or Decoders, AskDocumentation fetches information from both the documentation and decoder tools for the best contextualization of the feature.        
        - Actions enable event-driven automation through condition-based triggers, serving as the primary method for Analysis execution and supporting multiple trigger types including data insertion, time-based schedules, and custom conditions.
        
        <example>
          {
            "lookupCodeQuestions": {
              "question": ["How to create a new device?", "How to get the device list?"]
              "type": "analysis"
            }
          }
        </example>
        Current Date: ${new Date().toLocaleDateString()}
  `,
  parameters: analysisCodeBaseSchema.shape,
  title: "Analysis Code Search",
  tool: analysisCodeSearchTool,
};

export { analysisCodeConfigJSON };
export { analysisCodeBaseSchema }; //export for testing purposes
