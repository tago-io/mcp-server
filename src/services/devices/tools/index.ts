import { IDeviceToolConfig } from "../../types";
import { deviceInfoConfigJSON } from "./device-info";
import { deviceListConfigJSON } from "./device-list";
import { getDeviceDataConfigJSON } from "./get-device-data";
import { deviceDataAmountConfigJSON } from "./device-data-amount";
import { deviceParamListConfigJSON } from "./device-param-list";

/**
 * @description Array of all device tool configurations.
 * Each tool configuration follows the IDeviceToolConfig interface structure
 * and will be automatically registered in the MCP server.
 */
const deviceTools: IDeviceToolConfig[] = [deviceListConfigJSON, deviceInfoConfigJSON, getDeviceDataConfigJSON, deviceParamListConfigJSON, deviceDataAmountConfigJSON];

export { deviceTools };
