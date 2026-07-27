import { IToolConfig } from "../../types";
import { getConnectorConfigJSON } from "./get-connector";
import { getNetworkConfigJSON } from "./get-network";
import { searchConnectorsConfigJSON } from "./search-connectors";
import { searchNetworksConfigJSON } from "./search-networks";

const integrationTools: IToolConfig[] = [searchConnectorsConfigJSON, getConnectorConfigJSON, searchNetworksConfigJSON, getNetworkConfigJSON];

export { integrationTools };
