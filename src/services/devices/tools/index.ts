import { IDeviceToolConfig } from "../../types";
import { deviceDataConfigJSON } from "./device-data";
import { deviceDeleteDataConfigJSON } from "./device-delete-data";
import { deviceOperationsConfigJSON } from "./device-operations";

/**
 * @description Array of all device tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const deviceTools: IDeviceToolConfig[] = [deviceOperationsConfigJSON, deviceDeleteDataConfigJSON, deviceDataConfigJSON];

export { deviceTools };
