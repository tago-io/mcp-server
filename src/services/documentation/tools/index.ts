import { IToolConfig } from "../../types";
import { getCodeExampleConfigJSON } from "./get-code-example";
import { searchCodeExamplesConfigJSON } from "./search-code-examples";

const documentationTools: IToolConfig[] = [searchCodeExamplesConfigJSON, getCodeExampleConfigJSON];

export { documentationTools };
