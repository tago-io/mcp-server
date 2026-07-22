import { Tool, tool } from "ai";
import { z } from "zod/v3";

import { toolCatalog } from "../services/catalog";
import { IToolConfig, MutationClass } from "../services/types";

const NO_OP_RESULTS: Record<MutationClass, string> = {
  read: "No matching records. (deterministic no-op eval stub)",
  write: "Operation accepted. (deterministic no-op eval stub)",
  destructive: "Operation accepted. (deterministic no-op eval stub)",
};

/** Derived from the same catalog MCP registration uses, so eval tool definitions cannot drift from the server. Execution is a deterministic no-op: no network, no state. */
function buildEvalToolset(catalog: IToolConfig[] = toolCatalog): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  for (const config of catalog) {
    tools[config.name] = tool({
      description: config.description,
      inputSchema: z.object(config.parameters),
      execute: async () => NO_OP_RESULTS[config.mutationClass],
    });
  }

  return tools;
}

export { NO_OP_RESULTS, buildEvalToolset };
