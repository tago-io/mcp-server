import { IDeviceToolConfig } from "../../types";
import { analysisOperationsConfigJSON } from "./analysis-operations";

/**
 * @description Array of all analysis tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const analysisTools: IDeviceToolConfig[] = [analysisOperationsConfigJSON];

export { analysisTools };
