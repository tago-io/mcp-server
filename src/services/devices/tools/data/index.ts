import { IDeviceToolConfig } from "../../../types";
import { deviceDataConfigJSON } from "./device-data";

/**
 * @description Array of the device data CRUD operation tool configuration.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const deviceDataTools: IDeviceToolConfig[] = [deviceDataConfigJSON];

export { deviceDataTools };
