import { Resources } from "@tago-io/sdk";

import { classifyCredential } from "../server/shared";
import { CredentialKind, RegionConfig, ServerContext } from "../services/types";
import { fixtures } from "./mocks/fixtures";

const TEST_REGION: RegionConfig = {
  api: "https://api.us-e1.tago.io",
  sse: "https://sse.us-e1.tago.io",
};

/**
 * Builds a ServerContext for tests. Pass a partial mock of Resources (or MSW-backed
 * real Resources) plus any token/region the scenario needs. The credential kind is
 * classified from the token exactly as at runtime unless overridden. Device-token
 * contexts carry an authenticated device ID exactly as hosted validation and stdio
 * startup populate it, defaulting to the fixture device.
 */
function makeTestContext(
  overrides: { resources?: unknown; token?: string; credentialKind?: CredentialKind; region?: RegionConfig; authenticatedDeviceId?: string } = {}
): ServerContext {
  const token = overrides.token ?? "a-0000000000000000000000000000000000";
  const credentialKind = overrides.credentialKind ?? classifyCredential(token);
  const base = {
    resources: (overrides.resources ?? {}) as Resources,
    token,
    region: overrides.region ?? TEST_REGION,
  };
  if (credentialKind === "device") {
    return { ...base, credentialKind, authenticatedDeviceId: overrides.authenticatedDeviceId ?? fixtures.IDS.device };
  }
  return { ...base, credentialKind };
}

export { makeTestContext, TEST_REGION };
