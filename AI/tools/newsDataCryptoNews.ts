import { tool } from "ai";
import { z } from "zod";

import {
  fetchCryptoNews,
  isNewsDataConfigured,
} from "../../mcp/newsData.io/apiClient.js";

import { normalizeCryptoNews } from "../../mcp/newsData.io/cryptoNews.normalizer.js";

/** Articles returned per call. Matches `CRYPTO_NEWS_LIMIT`. */
const LIMIT = 10;

export const newsDataCryptoNewsTool = tool({
  description:
    "Get crypto news headlines and summaries from NewsData.io. Returns at most 5 articles, each with a title and a description, newest first. Use this for crypto-specific coverage of a coin or the crypto market generally. Expect price-prediction and promotional content to be common in these results. For general news use the latest news tool; for news about publicly listed companies and their analyst coverage use the market news tool.",

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