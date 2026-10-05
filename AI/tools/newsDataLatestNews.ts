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
    "Get the latest general news headlines and summaries from NewsData.io, covering roughly the last 48 hours, returning at most 5 articles with a title and description, newest first." +
    "Use this for broad current-events coverage across any subject, and it is the most genuinely general-purpose of the three NewsData tools - the measured run returned a housing-versus-bond-market analysis and a White House story, neither crypto-related." +
    "Expect at most 5 articles: the free plan caps a page at 10 and this tool requests 5, so this is a small sample rather than a feed." +
    "This feed overlaps heavily with the crypto tool when the subject is crypto, so prefer the crypto tool for crypto and the market tool for listed companies." +
    "For significant or ranked financial events use an events tool instead.",

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