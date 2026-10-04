import { tool } from "ai";
import { z } from "zod";

import { getBreakingNews } from "../../mcp/cryptocurrency.cv/fetchers/breaking.js";

/**
 * Articles requested when the caller does not specify.
 *
 * Small by default: the window is only about two hours, so a large page mostly
 * returns duplicate or near-duplicate coverage of the same events.
 */
const DEFAULT_LIMIT = 20;

export const cvBreakingTool = tool({
  description:
    "Get breaking crypto news from cryptocurrency.cv, covering roughly the last two hours, each with a title and a description, newest first. Use this when recency matters more than breadth. Note this feed interleaves Ethereum gas price tickers with real headlines, so some results are price widgets rather than news.",

  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(DEFAULT_LIMIT)
      .describe(
        "Maximum articles to return. The window is only about two hours, so a smaller value is usually enough.",
      ),
  }),

  execute: async (input, options) => {
    return await getBreakingNews({
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});