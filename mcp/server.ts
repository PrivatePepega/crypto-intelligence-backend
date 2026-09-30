import { McpServer } from "@modelcontextprotocol/server";

import { MCP_TOOL_MODULES } from "./registry.js";
import type { McpToolSet } from "./types.js";

export const MCP_SERVER_NAME = "crypto-intelligence-backend";
export const MCP_SERVER_TITLE = "Crypto Intelligence";
export const MCP_SERVER_VERSION = "1.0.0";

/**
 * Provider tool sets, built once per process.
 *
 * This memoisation is load-bearing rather than an optimisation:
 * `createMcpHandler` calls its factory once per HTTP request, so without it
 * every request would re-read configuration and construct a fresh API client
 * per provider.
 */
let toolSets: McpToolSet[] | null = null;

/** Namespaces that were configured, for the startup log and tests. */
export interface ResolvedMcpProviders {
  /** Tool sets that will be registered, in registry order. */
  readonly enabled: readonly string[];
  /** Namespaces skipped because their credentials are not configured. */
  readonly disabled: readonly string[];
}

let resolved: ResolvedMcpProviders | null = null;

/**
 * Resolves every provider module exactly once.
 *
 * A module that returns `null` is reported as disabled rather than thrown, so a
 * single missing API key cannot stop the backend from starting.
 */
export function resolveMcpProviders(): ResolvedMcpProviders {
  if (resolved !== null) {
    return resolved;
  }

  const namespaces = new Set<string>();
  const enabled: string[] = [];
  const disabled: string[] = [];
  const built: McpToolSet[] = [];

  for (const module of MCP_TOOL_MODULES) {
    // Duplicate namespaces would produce colliding tool names, which is a
    // programming error rather than a configuration problem.
    if (namespaces.has(module.namespace)) {
      throw new Error(
        `Duplicate MCP provider namespace "${module.namespace}"`,
      );
    }
    namespaces.add(module.namespace);

    // create() runs exactly once per module: it builds an API client, so
    // calling it twice would construct a second client and discard the first.
    const toolSet = module.create();

    if (toolSet === null) {
      disabled.push(module.namespace);
    } else {
      enabled.push(module.namespace);
      built.push(toolSet);
    }
  }

  resolved = { enabled, disabled };
  toolSets = built;

  return resolved;
}

/**
 * Builds a server instance with every enabled provider registered.
 *
 * A factory rather than a shared singleton: the HTTP entry constructs a fresh
 * instance per request, which is what the SDK expects. The expensive part
 * (provider setup) is shared via {@link resolveMcpProviders}.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      title: MCP_SERVER_TITLE,
      version: MCP_SERVER_VERSION,
    },
    { capabilities: { tools: {} } },
  );

  for (const toolSet of toolSets ?? []) {
    toolSet.register(server);
  }

  return server;
}
