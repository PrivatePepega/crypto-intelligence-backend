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
    "Get the latest general news headlines and summaries from NewsData.io, covering the last 48 hours. Returns at most 5 articles, each with a title and a description, newest first. Use this for broad current-events coverage across any subject. Note this feed substantially overlaps with crypto news when the query is crypto-related, so prefer the crypto news tool for crypto and the market news tool for listed companies.",

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