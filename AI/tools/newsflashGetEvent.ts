import { tool } from "ai";
import { z } from "zod";

import { callMcpTool } from "../../mcp/client.js";
import {
  normalizeNewsflashEvent,
  normalizeNewsflashEventForAI,
} from "../../mcp/newsFlash/newsFlashNormalizer.js";

export const newsflashGetEventTool = tool({
  description:
    "Fetch a specific Newsflash event by its event ID for deeper research. Use this after newsflashGetEvents when a particular event needs investigation. The tool returns a concise event summary rather than the underlying article details.",

  inputSchema: z.object({
    id: z
      .number()
      .int()
      .describe(
        "Newsflash event ID returned by newsflashGetEvents.",
      ),
  }),

  execute: async (input, options) => {
    const result = await callMcpTool(
      "newsflash_get_event",
      input,
      options.abortSignal,
    );

    const normalized = normalizeNewsflashEvent(result);

    return normalizeNewsflashEventForAI(normalized);
  },
});