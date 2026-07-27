import { IToolConfig } from "../../types";
import { createDashboardConfigJSON } from "./create-dashboard";
import { createWidgetConfigJSON } from "./create-widget";
import { deleteDashboardConfigJSON } from "./delete-dashboard";
import { deleteWidgetConfigJSON } from "./delete-widget";
import { getCustomWidgetCodeConfigJSON } from "./get-custom-widget-code";
import { getDashboardConfigJSON } from "./get-dashboard";
import { getWidgetConfigJSON } from "./get-widget";
import { uploadCustomWidgetCodeConfigJSON } from "./upload-custom-widget-code";
import { searchDashboardsConfigJSON } from "./search-dashboards";
import { updateDashboardConfigJSON } from "./update-dashboard";
import { validateWidgetConfigurationConfigJSON } from "./validate-widget-configuration";
import { updateWidgetConfigJSON } from "./update-widget";
import { widgetSchemaLookupConfigJSON } from "./widget-schema-lookup";

const dashboardTools: IToolConfig[] = [
  searchDashboardsConfigJSON,
  getDashboardConfigJSON,
  createDashboardConfigJSON,
  updateDashboardConfigJSON,
  deleteDashboardConfigJSON,
  getWidgetConfigJSON,
  createWidgetConfigJSON,
  updateWidgetConfigJSON,
  deleteWidgetConfigJSON,
  widgetSchemaLookupConfigJSON,
  validateWidgetConfigurationConfigJSON,
  getCustomWidgetCodeConfigJSON,
  uploadCustomWidgetCodeConfigJSON,
];

export { dashboardTools };
