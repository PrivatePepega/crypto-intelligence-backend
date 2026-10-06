import { tool } from "ai";
import { z } from "zod";
import { fetchMarketNews, isNewsDataConfigured } from "../../mcp/newsData.io/apiClient.js";
import { normalizeMarketNews } from "../../mcp/newsData.io/marketNews.normalizer.js";

const LIMIT = 10;

export const newsDataMarketNewsTool = tool({
  description:
    "NewsData.io market and company news focused on listed companies, analyst ratings, price targets, and developments.\n\n" +
    "Does: secondary market/company discovery using a keyword query.\n" +
    "Does not: support a strict ticker filter or guarantee high-quality reporting; promotional stock content is common.\n\n" +
    "Use for market breadth or targeted company follow-up, not as primary evidence.",
  inputSchema: z.object({
    q: z.string().optional().describe("Optional focused company, ticker, or subject query. This is the only supported filter."),
  }),
  execute: async (input, options) => {
    if (!isNewsDataConfigured()) throw new Error("NewsData.io is not configured. Set NEWSDATA_API_KEY in .env.");
    const envelope = await fetchMarketNews(
      { ...(input.q ? { q: input.q } : {}), language: "en", size: LIMIT },
      options.abortSignal,
    );
    return normalizeMarketNews(envelope);
  },
});
