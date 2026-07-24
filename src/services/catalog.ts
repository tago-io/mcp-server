import { accessPolicyTools } from "./access-management/tools/index";
import { actionTools } from "./actions/tools/index";
import { analysisTools } from "./analysis/tools/index";
import { dashboardTools } from "./dashboards/tools/index";
import { deviceTools } from "./devices/tools/index";
import { docsTools } from "./docs/tools/index";
import { documentationTools } from "./documentation/tools/index";
import { entityTools } from "./entities/tools/index";
import { fileTools } from "./files/tools/index";
import { integrationTools } from "./integration/tools/index";
import { profileMetricsTools } from "./profile/tools/index";
import { userTools } from "./run-users/tools/index";
import { IToolConfig } from "./types";

/**
 * @description The complete tool catalog: domain-owned arrays flattened once.
 * This is the single source consumed by MCP registration (buildServer) and by
 * eval toolset generation: names, titles, descriptions, schemas, annotations,
 * and mutation classes all live here.
 */
const toolCatalog: IToolConfig[] = [
  ...accessPolicyTools,
  ...actionTools,
  ...analysisTools,
  ...dashboardTools,
  ...deviceTools,
  ...docsTools,
  ...documentationTools,
  ...entityTools,
  ...fileTools,
  ...integrationTools,
  ...profileMetricsTools,
  ...userTools,
];

export { toolCatalog };
