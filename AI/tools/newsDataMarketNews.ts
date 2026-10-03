import { tool } from "ai";
import { z } from "zod";

import {
  fetchMarketNews,
  isNewsDataConfigured,
} from "../../mcp/newsData.io/apiClient.js";

import { normalizeMarketNews } from "../../mcp/newsData.io/marketNews.normalizer.js";

/** Articles returned per call. Matches `MARKET_NEWS_LIMIT`. */
const LIMIT = 10;

export const newsDataMarketNewsTool = tool({
  description:
    "Get stock market and financial news headlines and summaries from NewsData.io, covering analyst ratings, price targets and company developments. Returns at most 5 articles, each with a title and a description, newest first. Use this to follow publicly listed companies and their analyst coverage. Note there is no ticker filter on this endpoint - filter with the query field, not a symbol. Descriptions are frequently stock-promotion content, so weigh them critically.",

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