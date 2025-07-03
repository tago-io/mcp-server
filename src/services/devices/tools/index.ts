import { IDeviceToolConfig } from "../../types";
import { deviceLookupConfigJSON } from "./device-lookup";
// import { getDeviceDataConfigJSON } from "./get-device-data";

/**
 * @description Array of all device tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const deviceTools: IDeviceToolConfig[] = [deviceLookupConfigJSON];

export { deviceTools };
