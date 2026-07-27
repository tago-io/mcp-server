import { IToolConfig } from "../../types";
import { deleteAccessPolicyConfigJSON } from "./delete-access-policy";
import { getAccessPolicyConfigJSON } from "./get-access-policy";
import { lookupAccessPermissionsConfigJSON } from "./lookup-access-permissions";
import {
  createAnalysisAccessPolicyConfigJSON,
  createRunUserAccessPolicyConfigJSON,
  updateAnalysisAccessPolicyConfigJSON,
  updateRunUserAccessPolicyConfigJSON,
} from "./policy-write";
import { searchAccessPoliciesConfigJSON } from "./search-access-policies";

const accessPolicyTools: IToolConfig[] = [
  searchAccessPoliciesConfigJSON,
  getAccessPolicyConfigJSON,
  lookupAccessPermissionsConfigJSON,
  createAnalysisAccessPolicyConfigJSON,
  createRunUserAccessPolicyConfigJSON,
  updateAnalysisAccessPolicyConfigJSON,
  updateRunUserAccessPolicyConfigJSON,
  deleteAccessPolicyConfigJSON,
];

export { accessPolicyTools };
