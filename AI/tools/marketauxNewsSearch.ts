import { tool } from "ai";
import { z } from "zod";
import {
  fetchMarketauxNews,
  normalizeMarketauxNews,
  type NormalizedMarketauxNews,
} from "../../mcp/marketaux/newsSearch.normalizer.js";








export const marketauxSearchTool = tool({
    description:
      "Search Marketaux for financial and market articles, returning title, description and snippet per hit. " +
  "Use this as a BACKGROUND and entity tool, not as a news feed. It is genuinely useful for two things: pulling articles about a named company or sector via symbols, industries, countries and entity_types, and quietly narrowing the rest of the corpus by excluding sources and sentiment thresholds. " +
  "Do NOT use it for important or trending news. It returns a loosely date-sorted article backlog, not a ranked feed, and the measured crypto query returned only 3 articles against a limit of 10 - two of them evergreen SEO explainers ('BTCFi vs Ethereum DeFi: What's Different') and a ZeroHedge opinion post. Nothing in the output marks an item as significant. " +
  "Also expect `description` to be truncated mid-word by the provider, so treat it as a hint rather than quotable text. `entities` are stripped from this output, though every entity filter below still applies upstream. " +
  "For what is happening now use an events tool, the headline scan, or a web search; for company financial news use the market news tool.",
  
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
          "When true, group similar coverage of the same story, reducing duplicates. Worth setting for most research - the feed is a flat article backlog, so duplicate coverage of one event is otherwise common. Note this is one of the few controls that meaningfully improves signal here, since results carry no importance ranking.",
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
        .min(5)
        .max(20)
        .default(10)
        .describe(
          "Number of articles to return. Prefer 5-10 for Observer research so there is enough breadth to identify meaningful developments.",
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
  })

/**
 * Calls the Marketaux news search through the backend MCP server, normalized.
 *
 * The Observer talks to MCP rather than calling Marketaux directly, which keeps
 * provider access behind the generic MCP boundary. The result is passed through
 * `mcp/marketaux/newsSearch.normalizer.ts`, which drops the `entities` block and
 * keeps `title`, `description` and `snippet`.
 *
 * Re-exported so the normalizer stays reachable from this module, which is the
 * only place the agent-facing Marketaux path is wired up.
 */
export { normalizeMarketauxNews };

export const searchMarketauxNews = async (
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<NormalizedMarketauxNews> => {
  return await fetchMarketauxNews(input, signal);
};
