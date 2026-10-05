import { tool } from "ai";
import { z } from "zod";

import {
  fetchMarketNews,
  isNewsDataConfigured,
} from "../../mcp/newsData.io/apiClient.js";

import { normalizeMarketNews } from "../../mcp/newsData.io/marketNews.normalizer.js";

/** Articles returned per call. Matches `MARKET_NEWS_LIMIT`. */
const LIMIT = 20;

export const newsDataMarketNewsTool = tool({
  description:
    "NewsData.io stock market and company news - analyst ratings, price targets and developments. At most 5 articles.\n\n" +
    "Best for:\n" +
    "- listed companies and their analyst coverage\n" +
    "\n" +
    "Limitations:\n" +
    "- no ticker filter - a symbol filter is rejected, use the query field\n" +
    "- descriptions are frequently stock-promotion content\n" +
    "- at most 5 articles",

  inputSchema: z.object({
    q: z
      .string()
      .optional()
      .describe(
        'Search query, such as "COIN" or "bitcoin". Optional - omit for the full market feed. This is the only way to narrow results: the API rejects a symbol or market_id filter.',
      ),

    language: z
      .string()
      .optional()
      .describe('Two-letter language code, such as "en". Defaults to "en".'),
  }),

  execute: async (input, options) => {
    if (!isNewsDataConfigured()) {
      throw new Error(
        "NewsData.io is not configured. Set NEWSDATA_API_KEY in .env.",
      );
    }

    const envelope = await fetchMarketNews(
      {
        ...(input.q ? { q: input.q } : {}),
        language: input.language ?? "en",
        size: LIMIT,
      },
      options.abortSignal,
    );

    return normalizeMarketNews(envelope);
  },
});