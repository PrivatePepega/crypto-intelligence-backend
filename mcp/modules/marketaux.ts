import { MarketauxClient } from "../marketaux/client.js";
import { SearchAllNewsTool } from "../marketaux/SearchAllNewsTool.js";
import type { McpToolModule } from "../types.js";

/**
 * Marketaux news search, served from inside this process.
 *
 * The provider code in `src/` is the upstream third-party implementation. It is
 * reused as-is; only the tool name is namespaced (see `McpToolModule.namespace`)
 * so it cannot collide with tools from providers added later.
 *
 * The `MarketauxClient` is constructed once here rather than per request:
 * `createMcpServer` is called for every HTTP request, and rebuilding a client
 * each time would also mean re-reading configuration on the hot path.
 */
export const marketauxModule: McpToolModule = {
  namespace: "marketaux",

  create() {
    const apiKey = process.env.MARKETAUX_API_KEY;

    if (!apiKey) {
      // Warned once by the caller, which knows how many modules resolved.
      return null;
    }

    const client = new MarketauxClient(apiKey);

    return {
      register(server) {
        new SearchAllNewsTool(client).register(
          server,
          `${marketauxModule.namespace}_news_search`,
        );
      },
    };
  },
};
