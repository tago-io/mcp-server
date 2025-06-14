import { IDeviceToolConfig } from "../../types";
import { actionLookupConfigJSON } from "./action-lookup";

/**
 * @description Array of all action tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const actionTools: IDeviceToolConfig[] = [actionLookupConfigJSON];

export { actionTools };
