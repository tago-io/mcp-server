import { IDeviceToolConfig } from "../../types";
import { profileMetricsConfigJSON } from "./profile-metrics";

/**
 * @description Array of all profile metrics tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const profileMetricsTools: IDeviceToolConfig[] = [profileMetricsConfigJSON];

export { profileMetricsTools };
