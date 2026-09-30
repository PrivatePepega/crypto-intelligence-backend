import { tool } from "ai";
import { z } from "zod";
import {
  getCurrentIndicatorData,
  webSearchTool,
  searchMarketauxNews,
} from "./observer.utils.js";

// --------------------------------------------------
// Observer tools
// --------------------------------------------------

export const observerTools = {
  get_current_indicator: tool({
    description:
      "Find up to three relevant deterministic indicators for a natural-language request and return their current datasets together with metadata explaining what each indicator measures, how it is used, and why it is significant. Use this when current quantitative data is needed to understand a development or change.",

    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Describe the current quantitative information needed in natural language.",
        ),
    }),

    execute: async ({ query }) => {
      const toolResponse = await getCurrentIndicatorData(query);

      return toolResponse.result;
    },
  }),

  web_search: webSearchTool,

  marketaux_news_search: tool({
    description:
      "Search Marketaux financial and market news for recent developments relevant to the Observer's domain. Use focused filters when possible instead of broad searches. Prefer recent dates, relevant entities, and grouped similar coverage so the Observer can identify meaningful events rather than generic historical articles.",

    inputSchema: z.object({
      symbols: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Marketaux entity symbols to match, such as 'CC:BTC' for Bitcoin. Use this when tracking a specific asset or entity.",
        ),

      entity_types: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Entity types to match, such as 'cryptocurrency,equity,index'.",
        ),

      industries: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Industries associated with matched entities, such as 'Technology'.",
        ),

      countries: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Two-letter countries associated with matched entities, such as 'us,ca'.",
        ),

      search: z
        .string()
        .optional()
        .describe(
          'Focused free-text query over article titles and bodies. Supports + for AND, | for OR, -token for NOT, quoted phrases, prefix*, and parentheses.',
        ),

      language: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Two-letter language codes, such as 'en'.",
        ),

      domains: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Restrict results to specific publisher domains, such as 'reuters.com'.",
        ),

      exclude_domains: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Exclude specific publisher domains from the results.",
        ),

      source_ids: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Restrict results to specific Marketaux source IDs.",
        ),

      exclude_source_ids: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Exclude specific Marketaux source IDs.",
        ),

      sentiment_gte: z
        .number()
        .min(-1)
        .max(1)
        .optional()
        .describe(
          "Minimum entity sentiment score from -1 to 1. Use 0 for neutral-or-positive coverage.",
        ),

      sentiment_lte: z
        .number()
        .min(-1)
        .max(1)
        .optional()
        .describe(
          "Maximum entity sentiment score from -1 to 1. Use 0 for neutral-or-negative coverage.",
        ),

      min_match_score: z
        .number()
        .optional()
        .describe(
          "Minimum Marketaux entity match score. Higher values require a stronger entity match.",
        ),

      filter_entities: z
        .boolean()
        .optional()
        .describe(
          "When true, return only entities that matched the search instead of every entity found in each article.",
        ),

      must_have_entities: z
        .boolean()
        .optional()
        .describe(
          "When true, exclude articles where Marketaux identified no matching entity.",
        ),

      group_similar: z
        .boolean()
        .optional()
        .describe(
          "When true, collapse duplicate coverage of the same story. Prefer true for Observer research.",
        ),

      published_after: z
        .string()
        .optional()
        .describe(
          "Only return articles published after this date. Use YYYY-MM-DD or a more precise UTC timestamp.",
        ),

      published_before: z
        .string()
        .optional()
        .describe(
          "Only return articles published before this date. Use YYYY-MM-DD or a more precise UTC timestamp.",
        ),

      published_on: z
        .string()
        .optional()
        .describe(
          "Only return articles published on this exact UTC calendar date. Format YYYY-MM-DD.",
        ),

      sort: z
        .enum([
          "published_at",
          "published_on",
          "entity_match_score",
          "entity_sentiment_score",
          "relevance_score",
        ])
        .optional()
        .describe(
          "Sort results by publication time, entity match, sentiment, or relevance. Prefer published_at for recent-event observation unless relevance is specifically useful.",
        ),

      sort_order: z
        .enum(["asc", "desc"])
        .optional()
        .describe(
          "Sort direction. The API primarily honors this for entity match and sentiment scores.",
        ),

      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          "Number of articles to return. The free Marketaux plan caps this at 3. Keep the value small for Observer calls.",
        ),

      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          "1-based result page. Use this only when additional coverage is needed after reviewing the first page.",
        ),

      include_highlights: z
        .boolean()
        .optional()
        .describe(
          "Include matched entity text highlights. Usually leave false to keep Observer context compact.",
        ),
    }),

    execute: async (input, options) => {
      return await searchMarketauxNews(input, options.abortSignal);
    },
  }),
};
