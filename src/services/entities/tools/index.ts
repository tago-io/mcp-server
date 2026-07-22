import { IToolConfig } from "../../types";
import { createEntityConfigJSON } from "./create-entity";
import { deleteEntityConfigJSON } from "./delete-entity";
import { deleteEntityDataConfigJSON } from "./delete-entity-data";
import { editEntityDataConfigJSON } from "./edit-entity-data";
import { emptyEntityDataConfigJSON } from "./empty-entity-data";
import { getEntityConfigJSON } from "./get-entity";
import { readEntityDataConfigJSON } from "./read-entity-data";
import { searchEntitiesConfigJSON } from "./search-entities";
import { sendEntityDataConfigJSON } from "./send-entity-data";
import { updateEntityConfigJSON } from "./update-entity";
import { updateEntitySchemaConfigJSON } from "./update-entity-schema";

const entityTools: IToolConfig[] = [
  searchEntitiesConfigJSON,
  getEntityConfigJSON,
  createEntityConfigJSON,
  updateEntityConfigJSON,
  deleteEntityConfigJSON,
  updateEntitySchemaConfigJSON,
  readEntityDataConfigJSON,
  sendEntityDataConfigJSON,
  editEntityDataConfigJSON,
  deleteEntityDataConfigJSON,
  emptyEntityDataConfigJSON,
];

export { entityTools };
