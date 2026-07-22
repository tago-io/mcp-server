/**
 * Entry point for spawned stdio smoke tests: starts the MSW mock server with
 * the deterministic fixtures, then boots the real stdio MCP server. The
 * spawning test provides TAGOIO_TOKEN/TAGOIO_API via env; all TagoIO API
 * traffic is intercepted in-process, so the child never touches the network.
 */
import { mockServer, strictListenOptions } from "./mocks/server";

mockServer.listen(strictListenOptions);

import("../server/stdio-server.js").then(({ startStdioServer }) => startStdioServer());
