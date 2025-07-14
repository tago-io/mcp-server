import { IDeviceToolConfig } from "../../types";
import { actionOperationsConfigJSON } from "./action-operations";

/**
 * @description Array of all action tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const actionTools: IDeviceToolConfig[] = [actionOperationsConfigJSON];

export { actionTools };
