import { IDeviceToolConfig } from "../../types";
import { analysisLookupConfigJSON } from "./analysis-lookup";

/**
 * @description Array of all analysis tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const analysisTools: IDeviceToolConfig[] = [analysisLookupConfigJSON];

export { analysisTools };
