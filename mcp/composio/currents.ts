import { createCurrentsClient } from "../composio/currents.client.js";
import type { McpToolModule } from "../types.js";
import { CurrentsNewsTool } from "./currentsNewsTool.js";

export const currentsModule: McpToolModule = {
  namespace: "currents",

  create() {
    if (
      !process.env.COMPOSIO_API_KEY ||
      !process.env.COMPOSIO_USER_ID
    ) {
      return null;
    }

    const client = createCurrentsClient();

    return {
      register(server) {
        new CurrentsNewsTool(client).register(server);
      },
    };
  },
};