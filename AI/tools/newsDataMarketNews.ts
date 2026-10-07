import { tool } from "ai";
import { z } from "zod";
import { fetchMarketNews, isNewsDataConfigured } from "../../mcp/newsData.io/apiClient.js";
import {
  normalizeMarketNews,
  MARKET_NEWS_LIMIT,
} from "../../mcp/newsData.io/marketNews.normalizer.js";

/**
 * Articles requested when the agent does not choose a count.
 *
 * Capped at {@link MARKET_NEWS_LIMIT} because that is all the normalizer returns
 * anyway, and NewsData's free plan rejects a `size` above 10 with HTTP 422.
 * Asking for more would spend a request to fetch articles that get discarded.
 */
const LIMIT = 5;

export const newsDataMarketNewsTool = tool({
  description:
    "NewsData.io market and company news focused on listed companies, analyst ratings, price targets, and developments.\n\n" +
    "Does: secondary market/company discovery using a keyword query.\n" +
    "Does not: support a strict ticker filter or guarantee high-quality reporting; promotional stock content is common.\n\n" +
    "Use for market breadth or targeted company follow-up, not as primary evidence.",
  inputSchema: z.object({
    q: z
      .string()
      .optional()
      .describe(
        "Optional focused company, ticker, or subject query. This is the only supported filter.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MARKET_NEWS_LIMIT)
      .default(LIMIT)
      .describe(
        "How many articles to return, each a title plus a short standfirst. Use a small number for one company and a larger one when scanning broadly.",
      ),
  }),
  execute: async (input, options) => {
    if (!isNewsDataConfigured())
      throw new Error("NewsData.io is not configured. Set NEWSDATA_API_KEY in .env.");
    const envelope = await fetchMarketNews(
      { ...(input.q ? { q: input.q } : {}), language: "en", size: input.limit },
      options.abortSignal,
    );
    return normalizeMarketNews(envelope, input.limit);
  },
});
