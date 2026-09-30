import type { McpServer } from "@modelcontextprotocol/server";

/**
 * A provider's tool surface, ready to be registered on an MCP server.
 *
 * Returned by {@link McpToolModule.create} so that provider setup (API keys,
 * HTTP clients) happens once at boot rather than on every MCP request.
 */
export type McpToolSet = {
  /**
   * Registers this provider's tools on the server.
   *
   * Tool names must be unique across every module. Use the module's
   * `namespace` as the prefix (e.g. `marketaux_news_search`).
   */
  register(server: McpServer): void;
};

/**
 * One provider integration.
 *
 * To add a provider: write a module, then add it to the array in
 * `mcp/registry.ts`. Nothing else changes.
 */
export type McpToolModule = {
  /** Prefix for every tool this module registers, e.g. `"marketaux"`. */
  readonly namespace: string;

  /**
   * Builds the tool set, or returns `null` when the provider is not
   * configured (missing API key).
   *
   * Returning `null` disables the provider instead of failing startup, so one
   * unconfigured integration cannot take the API server down with it. A module
   * that is disabled is simply absent from `tools/list`.
   */
  create(): McpToolSet | null;
};
