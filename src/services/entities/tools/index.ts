import { IDeviceToolConfig } from "../../types";
import { entityOperationsConfigJSON } from "./entity-operations";

/**
 * @description Array of all entity tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const entityTools: IDeviceToolConfig[] = [entityOperationsConfigJSON];

export { entityTools };
