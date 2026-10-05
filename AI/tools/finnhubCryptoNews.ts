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
    "Get the latest crypto news headlines and summaries from Finnhub, newest first. Returns a title and a summary per article. Use this for general crypto market coverage. Note that roughly a third of articles carry no summary at all - some publishers supply only a headline - so an empty summary is normal rather than a failure. For a single coin or company use a crypto-specific data tool instead.",

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