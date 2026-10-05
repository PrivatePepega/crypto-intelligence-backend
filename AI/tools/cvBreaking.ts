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
    "Get breaking crypto news from cryptocurrency.cv, covering roughly the last two hours, each with a title and a description, newest first." +
    "Use this when recency matters more than breadth - it is the best-populated of the cryptocurrency.cv feeds, returning a full 10 articles on the last measured run, including substantive items like a public bitcoin treasury adding 2,000 BTC and a weekly-close resistance note." +
    "Note that this endpoint can interleave Ethereum gas price tickers with real headlines, so check that each title reads as news and discard ticker items." +
    "The free tier caps responses at 3 articles regardless of the limit requested, so the count you get may not match the limit you asked for." +
    "For breadth rather than recency use the news tool.",

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