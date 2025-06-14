import { IDeviceToolConfig } from "../../types";
import { userLookupConfigJSON } from "./user-lookup";

/**
 * @description Array of all user tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const userTools: IDeviceToolConfig[] = [userLookupConfigJSON];

export { userTools };
