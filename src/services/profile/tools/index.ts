import { IDeviceToolConfig } from "../../types";
import { profileLookupConfigJSON } from "./profile-lookup";
import { profileMetricsConfigJSON } from "./profile-metrics";

/**
 * @description Array of all profile tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const profileMetricsTools: IDeviceToolConfig[] = [profileMetricsConfigJSON, profileLookupConfigJSON];

export { profileMetricsTools };
