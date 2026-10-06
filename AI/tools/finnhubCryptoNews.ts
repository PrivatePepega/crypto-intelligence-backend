import { tool } from "ai";
import { z } from "zod";
import { getCryptoNews } from "../../mcp/finnhub/cryptoNews.normalizer.js";

const CRYPTO_NEWS_LIMIT = 10;
const MAX_LIMIT = 15;

export const finnhubCryptoNewsTool = tool({
  description:
    "Latest crypto news from Finnhub with titles and summaries.\n\n" +
    "Does: mainstream financial coverage of the crypto market and individual crypto subjects.\n" +
    "Does not: guarantee complete summaries; many articles lack summaries and some summaries are long.\n\n" +
    "Use for broader crypto coverage after the highest-signal feeds.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(MAX_LIMIT).default(CRYPTO_NEWS_LIMIT).describe(
      "Maximum articles to return. Results are trimmed after the provider fetch.",
    ),
  }),
  execute: async (input, options) => {
    return await getCryptoNews({ limit: input.limit, signal: options.abortSignal });
  },
});
