import { tool } from "ai";
import { z } from "zod";

import { getCryptoNews } from "../../mcp/finnhub/cryptoNews.normalizer.js";

/**
 * How many crypto articles this tool returns.
 *
 * This is the single place the page size is decided - change it here and both
 * the default and the ceiling move with it.
 *
 * It caps the **client-side** result rather than the API request, because
 * Finnhub ignores the `limit` parameter: a request for 5 came back with 89
 * records. `getCryptoNews` therefore trims after fetching, and this value is
 * what survives.
 */
const CRYPTO_NEWS_LIMIT = 20;

/** Ceiling accepted from the caller. Kept aligned with the constant above. */
const MAX_LIMIT = 25;

export const finnhubCryptoNewsTool = tool({
  description:
    "Get the latest crypto news headlines and summaries from Finnhub, newest first, returning a title and summary per article." +
    "Use this for general crypto market coverage from a mainstream financial feed rather than a crypto-native index." +
    "A measured run returned 5 well-formed items including a stablecoin expansion story and a bitcoin price-structure note." +
    "Expect some articles to carry no summary at all - publishers such as CoinDesk and SeekingAlpha supply a headline only - so an absent summary is normal rather than a failure, and roughly a third of items are affected." +
    "Summaries vary hugely in length, from around 80 characters to several thousand, so do not assume a consistent article size." +
    "For a specific coin's price or market data use a crypto data tool instead.",

  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .default(CRYPTO_NEWS_LIMIT)
      .describe(
        `Maximum articles to return (default ${CRYPTO_NEWS_LIMIT}). Applied after fetching, since the API returns its full feed regardless.`,
      ),
  }),

  execute: async (input, options) => {
    return await getCryptoNews({
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});