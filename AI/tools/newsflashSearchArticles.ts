import { tool } from "ai";
import { z } from "zod";

import { callMcpTool } from "../../mcp/client.js";
import {
  normalizeNewsflashArticles,
  normalizeNewsflashArticlesForAI,
} from "../../mcp/newsFlash/newsFlashNormalizer.js";

export const newsflashSearchArticlesTool = tool({
  description:
    "Search Newsflash's underlying news articles when individual article coverage is needed rather than deduplicated events. Use this to find specific reporting around a topic. The tool returns only article titles and summaries to keep agent context compact.",

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