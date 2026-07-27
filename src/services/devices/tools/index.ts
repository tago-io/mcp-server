import { IToolConfig } from "../../types";
import { configureDeviceConfigJSON } from "./configure-device";
import { createDeviceConfigJSON } from "./create-device";
import { deleteDeviceConfigJSON } from "./delete-device";
import { deleteDeviceDataConfigJSON } from "./delete-device-data";
import { editDeviceDataConfigJSON } from "./edit-device-data";
import { getDeviceConfigJSON } from "./get-device";
import { readDeviceDataConfigJSON } from "./read-device-data";
import { searchDevicesConfigJSON } from "./search-devices";
import { sendDeviceDataConfigJSON } from "./send-device-data";
import { updateDeviceConfigJSON } from "./update-device";

const deviceTools: IToolConfig[] = [
  searchDevicesConfigJSON,
  getDeviceConfigJSON,
  createDeviceConfigJSON,
  updateDeviceConfigJSON,
  deleteDeviceConfigJSON,
  configureDeviceConfigJSON,
  readDeviceDataConfigJSON,
  sendDeviceDataConfigJSON,
  editDeviceDataConfigJSON,
  deleteDeviceDataConfigJSON,
];

export { deviceTools };
