import { tool } from "ai";
import { z } from "zod";

import {
  fetchCryptoNews,
  isNewsDataConfigured,
} from "../../mcp/newsData.io/apiClient.js";

import { normalizeCryptoNews } from "../../mcp/newsData.io/cryptoNews.normalizer.js";

/** Articles returned per call. Matches `CRYPTO_NEWS_LIMIT`. */
const LIMIT = 20;

export const newsDataCryptoNewsTool = tool({
  description:
    "NewsData.io crypto headlines and summaries, at most 5 articles, newest first.\n\n" +
    "Best for:\n" +
    "- crypto-specific coverage of a coin or the crypto market generally\n" +
    "\n" +
    "Limitations:\n" +
    "- at most 5 articles - the free plan caps a page at 10\n" +
    "- includes unrelated and promotional items, so check each for relevance\n" +
    "- overlaps the latest feed when the subject is crypto",

  inputSchema: z.object({
    coin: z
      .string()
      .optional()
      .describe(
        'Coin filter, such as "btc" or "eth". Optional - omit for general crypto news. Note the coin filter tags articles rather than restricting them strictly, so results may mention other coins too.',
      ),

    language: z
      .string()
      .optional()
      .describe(
        'Two-letter language code, such as "en". Defaults to "en".',
      ),
  }),

  execute: async (input, options) => {
    // Fail loudly when unconfigured rather than returning an empty list that
    // reads as "no news".
    if (!isNewsDataConfigured()) {
      throw new Error(
        "NewsData.io is not configured. Set NEWSDATA_API_KEY in .env.",
      );
    }

    const envelope = await fetchCryptoNews(
      {
        ...(input.coin ? { coin: input.coin } : {}),
        language: input.language ?? "en",
        size: LIMIT,
      },
      options.abortSignal,
    );

    // `fetchCryptoNews` raises on a failed call, so an empty `items` array here
    // means the API genuinely returned no articles.
    return normalizeCryptoNews(envelope);
  },
});