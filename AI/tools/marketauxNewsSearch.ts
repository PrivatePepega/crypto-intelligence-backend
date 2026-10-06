import { tool } from "ai";
import { z } from "zod";
import {
  fetchMarketauxNews,
  normalizeMarketauxNews,
  type NormalizedMarketauxNews,
} from "../../mcp/marketaux/newsSearch.normalizer.js";

export const marketauxSearchTool = tool({
  description:
    "Marketaux article search returning compact titles, descriptions, and snippets.\n\n" +
    "Does: targeted company, sector, asset, country, sentiment, and publisher filtering; useful for background coverage and corroboration.\n" +
    "Does not: rank importance or behave like a live breaking-news feed. Coverage can be thin and descriptions may truncate.\n\n" +
    "Use for targeted follow-up after an observation, not for the first broad sweep.",
  inputSchema: z.object({
    symbols: z.union([z.string(), z.array(z.string())]).optional().describe(
      "Entity symbols, such as 'CC:BTC', when tracking a known asset.",
    ),
    entity_types: z.union([z.string(), z.array(z.string())]).optional().describe(
      "Entity type filter, such as 'cryptocurrency'.",
    ),
    industries: z.union([z.string(), z.array(z.string())]).optional().describe(
      "Industry filter for matched entities.",
    ),
    countries: z.union([z.string(), z.array(z.string())]).optional().describe(
      "Two-letter country filter such as 'us,gb'.",
    ),
    search: z.string().optional().describe(
      "Short focused content query. Use a few subjects or OR terms; do not put dates here.",
    ),
    domains: z.union([z.string(), z.array(z.string())]).optional().describe(
      "Optional publisher-domain filter.",
    ),
    exclude_domains: z.union([z.string(), z.array(z.string())]).optional().describe(
      "Optional publisher-domain exclusions to reduce duplicate or low-value coverage.",
    ),
    sentiment_gte: z.number().min(-1).max(1).optional().describe(
      "Optional minimum entity sentiment when sentiment is relevant.",
    ),
    sentiment_lte: z.number().min(-1).max(1).optional().describe(
      "Optional maximum entity sentiment when sentiment is relevant.",
    ),
    min_match_score: z.number().optional().describe(
      "Optional minimum entity match score when stronger entity matching is needed.",
    ),
    group_similar: z.boolean().optional().describe(
      "Group similar coverage of the same story. Prefer true for Observer research to reduce duplicates.",
    ),
    published_after: z.string().optional().describe(
      "Optional lower publication-time bound.",
    ),
    published_before: z.string().optional().describe(
      "Optional upper publication-time bound.",
    ),
    published_on: z.string().optional().describe(
      "Optional exact UTC date in YYYY-MM-DD format.",
    ),
    limit: z.number().int().min(5).max(15).default(10).describe(
      "Maximum articles. Keep small for Observer context efficiency.",
    ),
    page: z.number().int().min(1).optional().describe(
      "Result page. Start at 1; paginate only when distinct coverage is needed.",
    ),
  }),
  execute: async (input, options) => {
    return await searchMarketauxNews(input, options.abortSignal);
  },
});

export { normalizeMarketauxNews };

export const searchMarketauxNews = async (
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<NormalizedMarketauxNews> => {
  return await fetchMarketauxNews(input, signal);
};
