import { IToolConfig } from "../../types";
import { platformOverviewConfigJSON } from "./platform-overview";
import { readDocConfigJSON } from "./read-doc";
import { searchDocsConfigJSON } from "./search-docs";

const docsTools: IToolConfig[] = [searchDocsConfigJSON, readDocConfigJSON, platformOverviewConfigJSON];

export { docsTools };
