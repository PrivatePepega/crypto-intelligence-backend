import { tool } from "ai";
import { z } from "zod";
import { callMcpTool } from "../../mcp/client.js";











export const observerTools = {

  marketaux_news_search: tool({
    description:
      "Search Marketaux for recent financial and market news relevant to the Observer's domain. This tool is for discovering meaningful current events, not exhaustive research. ALWAYS return English-language articles. Keep search queries short and focused. Marketaux search supports | for OR, + for AND, -token for NOT, quoted phrases, prefix*, and parentheses. Prefer queries such as 'Bitcoin|Ethereum|DeFi|stablecoin' rather than long natural-language sentences. Do not put dates inside search when published_on, published_after, or published_before can express the date. Use published_on for today's coverage. Prefer group_similar=true to reduce duplicate coverage. Marketaux already sorts recent articles by publication time by default when no search-specific relevance sort is requested.",
  
    inputSchema: z.object({
      symbols: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Marketaux entity symbols to match, such as 'CC:BTC'. Use when tracking a specific known crypto asset or entity.",
        ),
  
      entity_types: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Entity types to match, such as 'cryptocurrency'.",
        ),
  
      industries: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Industries associated with matched entities.",
        ),
  
      countries: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Two-letter countries associated with matched entities, such as 'us,gb'.",
        ),
  
      search: z
        .string()
        .optional()
        .describe(
          "Short focused free-text query over article content. Use a few important topics or OR terms. Good example: 'Bitcoin|Ethereum|DeFi|stablecoin'. Bad example: 'September 30 2026 cryptocurrency news Bitcoin Ethereum DeFi stablecoin regulation security incident'. Do not put dates in this field when published_on can express the date.",
        ),
  
      language: z
        .literal("en")
        .default("en")
        .describe(
          "Language filter. Always use English ('en') for Observer news research.",
        ),
  
      domains: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Restrict results to specific publisher domains when particular sources are relevant.",
        ),
  
      exclude_domains: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Exclude specific publisher domains when duplicate or low-value coverage needs to be reduced.",
        ),
  
      source_ids: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Restrict results to specific Marketaux source IDs. Usually unnecessary for Observer discovery.",
        ),
  
      exclude_source_ids: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Exclude specific Marketaux source IDs. Usually unnecessary for Observer discovery.",
        ),
  
      sentiment_gte: z
        .number()
        .min(-1)
        .max(1)
        .optional()
        .describe(
          "Minimum entity sentiment score from -1 to 1. Use only when sentiment itself is relevant.",
        ),
  
      sentiment_lte: z
        .number()
        .min(-1)
        .max(1)
        .optional()
        .describe(
          "Maximum entity sentiment score from -1 to 1. Use only when sentiment itself is relevant.",
        ),
  
      min_match_score: z
        .number()
        .optional()
        .describe(
          "Minimum Marketaux entity match score. Use only when stronger entity matching is specifically needed.",
        ),
  
      filter_entities: z
        .boolean()
        .optional()
        .describe(
          "When true, return only entities that matched the search.",
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
          "When true, group similar coverage of the same story. Prefer true for Observer research so duplicate reporting does not dominate observations.",
        ),
  
      published_after: z
        .string()
        .optional()
        .describe(
          "Only return articles published after this date or UTC timestamp.",
        ),
  
      published_before: z
        .string()
        .optional()
        .describe(
          "Only return articles published before this date or UTC timestamp.",
        ),
  
      published_on: z
        .string()
        .optional()
        .describe(
          "Only return articles published on this exact UTC calendar date. Format YYYY-MM-DD. Prefer this over putting a date inside search.",
        ),
  
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(20)
        .describe(
          "Number of articles to return. Prefer 10-20 for Observer research so there is enough breadth to identify meaningful developments.",
        ),
  
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          "1-based result page. Start with page 1. Only request another page when additional distinct coverage is needed.",
        ),
    }),
  
    execute: async (input, options) => {
      return await searchMarketauxNews(
        input,
        options.abortSignal,
      );
    },
  }),
};





/**
 * Calls the Marketaux news search through the backend MCP server.
 *
 * The Observer talks to MCP instead of calling the Marketaux API directly.
 * This keeps provider access behind the generic MCP boundary.
 */
export const searchMarketauxNews = async (
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ) => {
  
    return await callMcpTool(
      "marketaux_news_search",
      input,
      signal,
    );
  };