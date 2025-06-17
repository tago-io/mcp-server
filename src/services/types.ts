import { ZodRawShape } from "zod/v3";
import { Resources } from "@tago-io/sdk";

/**
 * @description Interface for tool configuration.
 * This interface defines the structure for all tool configurations
 * that are used to register tools in the MCP server.
 */
interface IDeviceToolConfig {
  /**
   * @description Unique identifier for the tool.
   * This name will be used to register the tool in the MCP server.
   * @example "get-device-list"
   */
  name: string;
  /**
   * @description Human-readable description of what the tool does.
   * This description will be shown to users when they interact with the tool.
   * @example "Get a list of devices"
   */
  description: string;
  /**
   * @description Zod schema object that defines the parameters the tool accepts.
   * This should be a raw shape object compatible with server.tool from MCP SDK.
   * @example { deviceID: z.string().describe("Device ID") }
   */
  parameters: ZodRawShape;
  /**
   * @description Display title for the tool in user interfaces.
   * @example "Get Device List"
   */
  title: string;
  /**
   * @description The actual function that implements the tool's functionality.
   * This function receives the TagoIO Resources instance and the parsed parameters,
   * and should return a string (usually Markdown-formatted) response.
   *
   * @param resources - TagoIO SDK Resources instance for API calls
   * @param params - Parsed and validated parameters from the Zod schema
   * @returns Promise that resolves to a string response (usually Markdown)
   */
  tool: (resources: Resources, params: any) => Promise<string>;
}

export { IDeviceToolConfig };
