import { IDeviceToolConfig } from "../../types";
import { deviceOperationsConfigJSON } from "./device-operations";
import { deviceDeleteDataConfigJSON } from "./device-delete-data";
import { deviceDataConfigJSON } from "./device-data";

/**
 * @description Array of all device tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const deviceTools: IDeviceToolConfig[] = [deviceOperationsConfigJSON, deviceDeleteDataConfigJSON, deviceDataConfigJSON];

export { deviceTools };
