import { IDeviceToolConfig } from "../../types";
import { entityLookupConfigJSON } from "./entity-lookup";

/**
 * @description Array of all entity tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const entityTools: IDeviceToolConfig[] = [entityLookupConfigJSON];

export { entityTools };
