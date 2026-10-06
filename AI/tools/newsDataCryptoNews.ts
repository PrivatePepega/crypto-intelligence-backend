import { tool } from "ai";
import { z } from "zod";
import { fetchCryptoNews, isNewsDataConfigured } from "../../mcp/newsData.io/apiClient.js";
import { normalizeCryptoNews } from "../../mcp/newsData.io/cryptoNews.normalizer.js";

const LIMIT = 10;

export const newsDataCryptoNewsTool = tool({
  description:
    "NewsData.io crypto news with headlines and summaries.\n\n" +
    "Does: broad crypto coverage and optional coin-focused discovery.\n" +
    "Does not: guarantee strict coin filtering or high signal; unrelated and promotional items can appear.\n\n" +
    "Use as secondary crypto breadth after higher-signal breaking/trending tools.",
  inputSchema: z.object({
    coin: z.string().optional().describe("Optional coin code such as 'btc' or 'eth'. This is a loose tag, not a strict filter."),
  }),
  execute: async (input, options) => {
    if (!isNewsDataConfigured()) throw new Error("NewsData.io is not configured. Set NEWSDATA_API_KEY in .env.");
    const envelope = await fetchCryptoNews(
      { ...(input.coin ? { coin: input.coin } : {}), language: "en", size: LIMIT },
      options.abortSignal,
    );
    return normalizeCryptoNews(envelope);
  },
});
