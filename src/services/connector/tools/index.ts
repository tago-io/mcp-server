import { IDeviceToolConfig } from "../../types";
import { connectorLookupConfigJSON } from "./connector-lookup";

/**
 * @description Array of all entity tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const connectorTools: IDeviceToolConfig[] = [connectorLookupConfigJSON];

export { connectorTools };
