import { tool } from "ai";
import { z } from "zod";

import { getNews } from "../../mcp/cryptocurrency.cv/fetchers/news.js";

/**
 * Articles requested when the caller does not specify.
 *
 * The limit lives here rather than in the normalizer so it can be tuned per
 * tool without editing provider code. The free tier caps the actual response at
 * 3 regardless, so a higher value only takes effect on a paid plan.
 */
const DEFAULT_LIMIT = 20;

export const cvNewsTool = tool({
  description:
    "Get general crypto news headlines from cryptocurrency.cv, each with a title and a description, newest first." +
    "Use this as a broad crypto sweep only when nothing more specific applies." +
    "Expect very few results and expect noise." +
    "A measured call returned just 2 items, and one of them was not news at all - a live Ethereum gas price ticker ('ETH Gas: 0.986935592 | 0.986952077 | 1.036935593 Gwei') whose title also had characters replaced by '?', so the encoding is lossy on some items." +
    "Treat the output as a small, imperfect sample rather than a feed: check that each title actually reads as news and discard ticker or garbled items." +
    "The free tier caps responses at 3 articles regardless of the limit requested." +
    "For fresher and better-populated crypto headlines use the breaking tool instead; for Bitcoin specifically use the bitcoin tool.",

  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(DEFAULT_LIMIT)
      .describe(
        "Maximum articles to return. The free tier caps responses at 3 regardless.",
      ),
  }),

  execute: async (input, options) => {
    return await getNews({
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});