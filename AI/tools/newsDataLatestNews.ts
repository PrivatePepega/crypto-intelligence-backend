import { tool } from "ai";
import { z } from "zod";
import { fetchLatestNews, isNewsDataConfigured } from "../../mcp/newsData.io/apiClient.js";
import { normalizeLatestNews } from "../../mcp/newsData.io/latestNews.normalizer.js";

const LIMIT = 10;

export const newsDataLatestNewsTool = tool({
  description:
    "NewsData.io general news from the last 48 hours.\n\n" +
    "Does: broad current-event discovery with optional keyword search.\n" +
    "Does not: rank importance or provide deep context; the feed can contain irrelevant stories.\n\n" +
    "Use for secondary breadth when higher-signal event feeds are insufficient.",
  inputSchema: z.object({
    q: z.string().optional().describe("Optional focused keyword or Boolean query. Omit for broad latest news."),
  }),
  execute: async (input, options) => {
    if (!isNewsDataConfigured()) throw new Error("NewsData.io is not configured. Set NEWSDATA_API_KEY in .env.");
    const envelope = await fetchLatestNews(
      { ...(input.q ? { q: input.q } : {}), language: "en", size: LIMIT },
      options.abortSignal,
    );
    return normalizeLatestNews(envelope);
  },
});
