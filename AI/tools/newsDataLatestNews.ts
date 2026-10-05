import { tool } from "ai";
import { z } from "zod";

import {
  fetchLatestNews,
  isNewsDataConfigured,
} from "../../mcp/newsData.io/apiClient.js";

import { normalizeLatestNews } from "../../mcp/newsData.io/latestNews.normalizer.js";

/** Articles returned per call. Matches `LATEST_NEWS_LIMIT`. */
const LIMIT = 20;

export const newsDataLatestNewsTool = tool({
  description:
    "NewsData.io general news from the last 48 hours, at most 5 articles, newest first.\n\n" +
    "Best for:\n" +
    "- broad current events across any subject\n" +
    "- non-crypto general news\n" +
    "\n" +
    "Limitations:\n" +
    "- at most 5 articles - a small sample rather than a feed\n" +
    "- overlaps the crypto feed for crypto subjects\n" +
    "- no significance ranking",

  inputSchema: z.object({
    q: z
      .string()
      .optional()
      .describe(
        "Search query. Optional - omit for the unfiltered latest feed. Supports AND, OR, NOT and parentheses.",
      ),

    language: z
      .string()
      .optional()
      .describe('Two-letter language code, such as "en". Defaults to "en".'),
  }),

  execute: async (input, options) => {
    if (!isNewsDataConfigured()) {
      throw new Error(
        "NewsData.io is not configured. Set NEWSDATA_API_KEY in .env.",
      );
    }

    const envelope = await fetchLatestNews(
      {
        ...(input.q ? { q: input.q } : {}),
        language: input.language ?? "en",
        size: LIMIT,
      },
      options.abortSignal,
    );

    return normalizeLatestNews(envelope);
  },
});