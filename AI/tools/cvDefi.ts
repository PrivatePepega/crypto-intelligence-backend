import { tool } from "ai";
import { z } from "zod";

import { getDefiNews } from "../../mcp/cryptocurrency.cv/fetchers/defi.js";

/** Articles requested when the caller does not specify. */
const DEFAULT_LIMIT = 20;

export const cvDefiTool = tool({
  description:
    "Get DeFi and prediction-market news from cryptocurrency.cv, each with a title and a description, newest first." +
    "Use this for decentralised-finance coverage - lending, DEXs, stablecoins, governance - and for prediction-market developments." +
    "Be aware of two things." +
    "First, this feed leans heavily toward prediction markets and their promotions rather than protocol news: the measured run included a sportsbook offer ('Polymarket Promo Code Rate: $25 Bonus for Falcons vs. Saints MNF') alongside a legitimate story about a governor refunding prediction-market donations, so discard affiliate and betting content." +
    "Second, descriptions are frequently promotional rather than informational." +
    "The free tier caps responses at 3 articles regardless of the limit requested." +
    "For broader crypto coverage use the news or breaking tool.",

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
    return await getDefiNews({
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});