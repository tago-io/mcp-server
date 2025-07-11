import { IDeviceToolConfig } from "../../types";
import { profileMetricsConfigJSON } from "./profile-metrics";
import { profileLookupConfigJSON } from "./profile-lookup";

/**
 * @description Array of all profile tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const profileMetricsTools: IDeviceToolConfig[] = [profileMetricsConfigJSON, profileLookupConfigJSON];

export { profileMetricsTools };
