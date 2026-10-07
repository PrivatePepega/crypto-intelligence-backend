import { tool } from "ai";
import { z } from "zod";
import { fetchLatestNews, isNewsDataConfigured } from "../../mcp/newsData.io/apiClient.js";
import {
  normalizeLatestNews,
  LATEST_NEWS_LIMIT,
} from "../../mcp/newsData.io/latestNews.normalizer.js";

/**
 * Articles requested when the agent does not choose a count.
 *
 * Capped at {@link LATEST_NEWS_LIMIT} because that is all the normalizer returns
 * anyway, and NewsData's free plan rejects a `size` above 10 with HTTP 422.
 * Asking for more would spend a request to fetch articles that get discarded.
 */
const LIMIT = 5;

export const newsDataLatestNewsTool = tool({
  description:
    "NewsData.io general news from the last 48 hours.\n\n" +
    "Does: broad current-event discovery with optional keyword search.\n" +
    "Does not: rank importance or provide deep context; the feed can contain irrelevant stories.\n\n" +
    "Use for secondary breadth when higher-signal event feeds are insufficient.",
  inputSchema: z.object({
    q: z
      .string()
      .optional()
      .describe("Optional focused keyword or Boolean query. Omit for broad latest news."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(LATEST_NEWS_LIMIT)
      .default(LIMIT)
      .describe(
        "How many articles to return, each a title plus a short standfirst. Use a small number for a targeted query and a larger one only when scanning broadly.",
      ),
  }),
  execute: async (input, options) => {
    if (!isNewsDataConfigured())
      throw new Error("NewsData.io is not configured. Set NEWSDATA_API_KEY in .env.");
    const envelope = await fetchLatestNews(
      { ...(input.q ? { q: input.q } : {}), language: "en", size: input.limit },
      options.abortSignal,
    );
    return normalizeLatestNews(envelope, input.limit);
  },
});
