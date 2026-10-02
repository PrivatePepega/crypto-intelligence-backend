import { currentsModule } from "./composio/currents.js";
import { marketauxModule } from "./modules/marketaux.js";
import type { McpToolModule } from "./types.js";

/**
 * Every provider exposed by this backend's MCP server.
 *
 * Adding a provider is a one-line change here: import the module and append it.
 * Order is the order the tools are registered on each server instance.
 */
export const MCP_TOOL_MODULES: readonly McpToolModule[] = [
  marketauxModule,
  currentsModule,

];
