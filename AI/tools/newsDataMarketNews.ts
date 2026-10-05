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
    "Get stock market and financial news from NewsData.io - analyst ratings, price targets and listed-company developments - returning at most 5 articles with a title and description, newest first." +
    "Use this to follow publicly listed companies and their analyst coverage." +
    "Two things to know before relying on it." +
    "There is no ticker or symbol filter on this endpoint; filter with the query field instead, and note that a symbol or market_id filter is rejected outright." +
    "And descriptions are frequently stock-promotion content rather than reporting, so read them critically and cross-check anything load-bearing." +
    "Expect at most 5 articles, as the free plan caps a page at 10." +
    "For broader market context use an events tool or the latest news tool.",

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