import { IToolConfig } from "../../types";
import { createAnalysisConfigJSON } from "./create-analysis";
import { deleteAnalysisConfigJSON } from "./delete-analysis";
import { downloadAnalysisScriptConfigJSON } from "./download-analysis-script";
import { getAnalysisConfigJSON } from "./get-analysis";
import { readAnalysisConsoleConfigJSON } from "./read-analysis-console";
import { runAnalysisConfigJSON } from "./run-analysis";
import { searchAnalysesConfigJSON } from "./search-analyses";
import { updateAnalysisConfigJSON } from "./update-analysis";
import { uploadAnalysisScriptConfigJSON } from "./upload-analysis-script";

const analysisTools: IToolConfig[] = [
  searchAnalysesConfigJSON,
  getAnalysisConfigJSON,
  createAnalysisConfigJSON,
  updateAnalysisConfigJSON,
  deleteAnalysisConfigJSON,
  uploadAnalysisScriptConfigJSON,
  downloadAnalysisScriptConfigJSON,
  runAnalysisConfigJSON,
  readAnalysisConsoleConfigJSON,
];

export { analysisTools };
