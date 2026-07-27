import { setupServer } from "msw/node";

import { handlers } from "./handlers";

/**
 * MSW node server preloaded with the deterministic TagoIO handlers.
 * Tests must start it with { onUnhandledRequest: "error" } (see setup below)
 * so unmocked SDK traffic fails loudly instead of reaching the network.
 */
const mockServer = setupServer(...handlers);

/** Standard listen options: reject any request without a handler. */
const strictListenOptions = { onUnhandledRequest: "error" } as const;

export { mockServer, strictListenOptions };
