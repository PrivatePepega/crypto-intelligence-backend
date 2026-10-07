import { tool } from "ai";
import { z } from "zod";
import { fetchCryptoNews, isNewsDataConfigured } from "../../mcp/newsData.io/apiClient.js";
import {
  normalizeCryptoNews,
  CRYPTO_NEWS_LIMIT,
} from "../../mcp/newsData.io/cryptoNews.normalizer.js";

/**
 * Articles requested when the agent does not choose a count.
 *
 * Capped at {@link CRYPTO_NEWS_LIMIT} because that is all the normalizer returns
 * anyway, and NewsData's free plan rejects a `size` above 10 with HTTP 422.
 * Asking for more would spend a request to fetch articles that get discarded.
 */
const LIMIT = 5;

export const newsDataCryptoNewsTool = tool({
  description:
    "NewsData.io crypto news with headlines and summaries.\n\n" +
    "Does: broad crypto coverage and optional coin-focused discovery.\n" +
    "Does not: guarantee strict coin filtering or high signal; unrelated and promotional items can appear.\n\n" +
    "Use as secondary crypto breadth after higher-signal breaking/trending tools.",
  inputSchema: z.object({
    coin: z
      .string()
      .optional()
      .describe(
        "Optional coin code such as 'btc' or 'eth'. This is a loose tag, not a strict filter.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(CRYPTO_NEWS_LIMIT)
      .default(LIMIT)
      .describe(
        "How many articles to return, each a title plus a short standfirst. Use a small number when checking one coin and a larger one when scanning broadly.",
      ),
  }),
  execute: async (input, options) => {
    if (!isNewsDataConfigured())
      throw new Error("NewsData.io is not configured. Set NEWSDATA_API_KEY in .env.");
    const envelope = await fetchCryptoNews(
      { ...(input.coin ? { coin: input.coin } : {}), language: "en", size: input.limit },
      options.abortSignal,
    );
    return normalizeCryptoNews(envelope, input.limit);
  },
});
