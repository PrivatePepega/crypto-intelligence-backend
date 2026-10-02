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
        void getNewsflashClient()
          .then((client) => {
            new GetEventsTool(client).register(server);
            new GetEventTool(client).register(server);
            new SearchArticlesTool(client).register(server);
          })
          .catch((error) => {
            console.error(
              "[Newsflash] Failed to initialize:",
              error,
            );
          });
      },
    };
  },
};