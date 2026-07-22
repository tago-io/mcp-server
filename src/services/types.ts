import { Resources } from "@tago-io/sdk";
import { ZodRawShape, ZodTypeAny } from "zod/v3";

/**
 * @description Region endpoints resolved for the current request.
 */
interface RegionConfig {
  api: string;
  sse: string;
}

/**
 * @description Kind of TagoIO credential the request authenticated with:
 * "p-" prefix = profile, "a-" prefix = analysis, unprefixed = device.
 * Classified once at context construction, never inside tool handlers.
 */
type CredentialKind = "profile" | "analysis" | "device";

/**
 * @description Credential-specific slice of the request context. A Device
 * token authenticates exactly one device, so the device context carries the
 * device ID returned by the token introspection; the authorization boundary
 * device-data tools must enforce against any supplied device_id.
 */
type CredentialContext = { credentialKind: "profile" | "analysis" } | { credentialKind: "device"; authenticatedDeviceId: string };

/**
 * @description Request-scoped context handed to every tool handler.
 * Carries the SDK client plus the credential/region data tools genuinely need,
 * so no handler ever reads credentials or region from process env.
 */
type ServerContext = {
  resources: Resources;
  token: string;
  region: RegionConfig;
} & CredentialContext;

/**
 * @description Coarse mutation classification used by eval tooling and
 * HITL gating. "read" never mutates, "write" mutates reversibly,
 * "destructive" deletes or irreversibly replaces data.
 */
type MutationClass = "read" | "write" | "destructive";

/**
 * @description MCP tool behavior annotations (subset of the MCP spec's
 * ToolAnnotations relevant to this server).
 */
interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * @description Configuration for a single MCP tool. Domain modules export
 * arrays of these; the flattened catalog is the only registration source.
 */
interface IToolConfig {
  /**
   * @description Unique identifier for the tool.
   * This name will be used to register the tool in the MCP server.
   * @example "search_devices"
   */
  name: string;
  /**
   * @description Human-readable description of what the tool does.
   * This description will be shown to users when they interact with the tool.
   */
  description: string;
  /**
   * @description Zod schema object that defines the parameters the tool accepts.
   * This should be a raw shape object compatible with registerTool from the MCP SDK.
   */
  parameters: ZodRawShape;
  /**
   * @description Display title for the tool in user interfaces.
   */
  title: string;
  /**
   * @description MCP behavior annotations advertised to clients.
   */
  annotations: ToolAnnotations;
  /**
   * @description Optional cross-field validation applied at the composition
   * root right after the SDK parses `parameters`, before the handler runs, so
   * handlers receive fully-valid input. Kept separate from `parameters` because
   * the pinned MCP SDK advertises a tool's input JSON Schema only for a bare
   * ZodObject: a top-level `.superRefine`/`.refine` yields a ZodEffects the SDK
   * cannot introspect, collapsing the advertised schema to empty properties.
   * This schema validates the parsed params (no transform) and raises the same
   * actionable errors as utils/tool-errors.ts.
   */
  crossFieldSchema?: ZodTypeAny;
  /**
   * @description Mutation classification consumed by eval tooling and HITL gating.
   */
  mutationClass: MutationClass;
  /**
   * @description The actual function that implements the tool's functionality.
   * Receives the request-scoped ServerContext and the parsed parameters, and
   * returns a string (usually Markdown-formatted) response.
   * Declared as a method (not a function property) so handlers typed with
   * their concrete Zod-parsed params stay assignable; method parameters are
   * checked bivariantly; the runtime shape is guaranteed by each tool's schema.
   */
  tool(context: ServerContext, params: unknown): Promise<string>;
}

export { CredentialContext, CredentialKind, IToolConfig, MutationClass, RegionConfig, ServerContext, ToolAnnotations };
