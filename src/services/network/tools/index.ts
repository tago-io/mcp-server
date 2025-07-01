import { IDeviceToolConfig } from "../../types";
import { networkLookupConfigJSON } from "./network-lookup";

/**
 * @description Array of all entity tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const networkTools: IDeviceToolConfig[] = [networkLookupConfigJSON];

export { networkTools };
