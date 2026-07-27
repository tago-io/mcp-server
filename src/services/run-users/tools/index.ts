import { IToolConfig } from "../../types";
import { createRunUserConfigJSON } from "./create-run-user";
import { deleteRunUserConfigJSON } from "./delete-run-user";
import { deleteRunUserNotificationConfigJSON } from "./delete-run-user-notification";
import { getRunUserConfigJSON } from "./get-run-user";
import { loginAsRunUserConfigJSON } from "./login-as-run-user";
import { readRunUserNotificationsConfigJSON } from "./read-run-user-notifications";
import { searchRunUsersConfigJSON } from "./search-run-users";
import { sendRunUserNotificationConfigJSON } from "./send-run-user-notification";
import { updateRunUserConfigJSON } from "./update-run-user";
import { updateRunUserNotificationConfigJSON } from "./update-run-user-notification";

const userTools: IToolConfig[] = [
  searchRunUsersConfigJSON,
  getRunUserConfigJSON,
  createRunUserConfigJSON,
  updateRunUserConfigJSON,
  deleteRunUserConfigJSON,
  readRunUserNotificationsConfigJSON,
  sendRunUserNotificationConfigJSON,
  updateRunUserNotificationConfigJSON,
  deleteRunUserNotificationConfigJSON,
  loginAsRunUserConfigJSON,
];

export { userTools };
