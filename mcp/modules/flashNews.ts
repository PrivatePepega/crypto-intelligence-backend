import { getNewsflashClient } from "../newsFlash/client.js";
import { GetEventsTool } from "../newsFlash/getEventsTool.js";
import { GetEventTool } from "../newsFlash/getEventTool.js";
import { SearchArticlesTool } from "../newsFlash/searchArticlesTool.js";
import type { McpToolModule } from "../types.js";

export const newsflashModule: McpToolModule = {
  namespace: "newsflash",

  create() {
    if (!process.env.NEWSFLASH_API_KEY) {
      return null;
    }

    return {
      register(server) {
        new GetEventsTool(getNewsflashClient).register(server);
        new GetEventTool(getNewsflashClient).register(server);
        new SearchArticlesTool(getNewsflashClient).register(server);
      },
    };
  },
};