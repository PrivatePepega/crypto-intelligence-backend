import { tool } from "ai";
import { z } from "zod";

import { callMcpTool } from "../../mcp/client.js";
import {
  normalizeNewsflashArticles,
  normalizeNewsflashArticlesForAI,
} from "../../mcp/newsFlash/newsFlashNormalizer.js";

export const newsflashSearchArticlesTool = tool({
  description:
    "Search Newsflash's underlying news articles by keyword, category and date, returning article titles and summaries." +
    "Use this when you need the individual reporting behind a story rather than a deduplicated event - for example to see how several outlets framed the same development." +
    "Because it returns flat articles it does not group duplicates, so the same story may appear more than once; when that matters, use the event search tool instead and read its clusters." +
    "Output is deliberately compact - titles and summaries only, no bodies - to keep agent context small." +
    "Keep the query focused on one subject.",

  inputSchema: z.object({
    q: z
      .string()
      .optional()
      .describe(
        "Topic, keyword, company, person, event, or concept to search for.",
      ),

    source: z
      .string()
      .optional()
      .describe(
        "Optional Newsflash source slug, such as coindesk.",
      ),

    category: z
      .enum([
        "crypto",
        "tradfi",
        "business",
        "tech",
        "politics",
        "world",
        "science",
        "health",
        "energy",
        "sports",
      ])
      .optional()
      .describe("Optional Newsflash news category."),

    from: z
      .string()
      .optional()
      .describe(
        "Optional ISO 8601 start date/time for the article search.",
      ),

    to: z
      .string()
      .optional()
      .describe(
        "Optional ISO 8601 end date/time for the article search.",
      ),

    limit: z
      .number()
      .int()
      .min(15)
      .max(100)
      .optional()
      .describe("Maximum number of articles to return."),
  }),

  execute: async (input, options) => {
    const result = await callMcpTool(
      "newsflash_search_articles",
      input,
      options.abortSignal,
    );

    const normalized = normalizeNewsflashArticles(result);

    return normalizeNewsflashArticlesForAI(normalized);
  },
});