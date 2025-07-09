import { IDeviceToolConfig } from "../../types";
import { analysisCodeConfigJSON } from "./analysis-code";
import { documentationConfigJSON } from "./documentation-lookup";

/**
 * @description Array of all documentation tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const documentationTools: IDeviceToolConfig[] = [analysisCodeConfigJSON, documentationConfigJSON];

export { documentationTools };