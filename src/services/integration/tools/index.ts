import { IDeviceToolConfig } from "../../types";
import { integrationLookupConfigJSON } from "./integration-lookup";

/**
 * @description Array of all entity tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const integrationTools: IDeviceToolConfig[] = [integrationLookupConfigJSON];

export { integrationTools };
