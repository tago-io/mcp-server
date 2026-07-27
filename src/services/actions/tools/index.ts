import { IToolConfig } from "../../types";
import { createActionConfigJSON } from "./create-action";
import { deleteActionConfigJSON } from "./delete-action";
import { getActionConfigJSON } from "./get-action";
import { searchActionsConfigJSON } from "./search-actions";
import { updateActionConfigJSON } from "./update-action";

const actionTools: IToolConfig[] = [searchActionsConfigJSON, getActionConfigJSON, createActionConfigJSON, updateActionConfigJSON, deleteActionConfigJSON];

export { actionTools };
