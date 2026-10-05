import { tool } from "ai";
import { z } from "zod";

import { callMcpTool } from "../../mcp/client.js";
import {
  normalizeNewsflashEvent,
  normalizeNewsflashEventForAI,
} from "../../mcp/newsFlash/newsFlashNormalizer.js";

export const newsflashGetEventTool = tool({
  description:
    "Fetch a single Newsflash event by its numeric event id, returning a concise event summary." +
    "Use this to go deeper on one event after a search has surfaced several candidates." +
    "IMPORTANT - the id must be supplied by the caller, and the event search tool does not currently return an id field: its records carry only title, summary and category." +
    "There is therefore no reliable way to obtain an id from within this toolset today, so this tool is effectively unreachable unless you already hold an id from another source." +
    "Check the event search output for an id before calling this; if there is none, stay with the search results.",

  inputSchema: z.object({
    id: z
      .number()
      .int()
      .describe(
        "Numeric event id returned by newsflashGetEvents. WARNING: that tool's records currently expose only title, summary and category - no id - so there is no way to obtain one from this toolset. Only call this if you already hold an id; otherwise stay with the search results.",
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