import { IToolConfig } from "../../types";
import { getProfileConfigJSON } from "./get-profile";
import { getProfileLimitsConfigJSON } from "./get-profile-limits";
import { getProfileStatisticsConfigJSON } from "./get-profile-statistics";
import { searchSecretsConfigJSON } from "./search-secrets";

const profileMetricsTools: IToolConfig[] = [getProfileConfigJSON, getProfileLimitsConfigJSON, getProfileStatisticsConfigJSON, searchSecretsConfigJSON];

export { profileMetricsTools };
