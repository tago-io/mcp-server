import { IToolConfig } from "../../types";
import { deleteFilesConfigJSON } from "./delete-files";
import { searchFilesConfigJSON } from "./search-files";

const fileTools: IToolConfig[] = [searchFilesConfigJSON, deleteFilesConfigJSON];

export { fileTools };
