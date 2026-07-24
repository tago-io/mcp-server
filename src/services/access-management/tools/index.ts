import { IToolConfig } from "../../types";
import { createAccessPolicyConfigJSON } from "./create-access-policy";
import { deleteAccessPolicyConfigJSON } from "./delete-access-policy";
import { getAccessPolicyConfigJSON } from "./get-access-policy";
import { lookupAccessPermissionsConfigJSON } from "./lookup-access-permissions";
import { searchAccessPoliciesConfigJSON } from "./search-access-policies";
import { updateAccessPolicyConfigJSON } from "./update-access-policy";

const accessPolicyTools: IToolConfig[] = [
  searchAccessPoliciesConfigJSON,
  getAccessPolicyConfigJSON,
  lookupAccessPermissionsConfigJSON,
  createAccessPolicyConfigJSON,
  updateAccessPolicyConfigJSON,
  deleteAccessPolicyConfigJSON,
];

export { accessPolicyTools };
