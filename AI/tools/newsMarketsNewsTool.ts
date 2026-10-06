import { tool } from "ai";
import { z } from "zod";
import { NEWSMARKETS_IN_SCOPE_SECTIONS } from "../../mcp/newsMarkets/client.js";
import { getSectionNews } from "../../mcp/newsMarkets/fetchers/index.js";

const NEWS_LIMIT = 10;

export const newsMarketsNewsTool = tool({
  description:
    "Curated NewsMarkets headlines and summaries for one section from a periodically republished snapshot.\n\n" +
    "Does: compact section-level orientation for crypto, AI, technology, and business.\n" +
    "Does not: provide a live/breaking feed, importance ranking, or paging. Section size varies significantly. Check generatedAt before treating it as current.\n\n" +
    "Use as secondary breadth, not as primary event evidence.",
  inputSchema: z.object({
    category: z.enum(NEWSMARKETS_IN_SCOPE_SECTIONS).describe(
      "Section: crypto, ai, tech, or business.",
    ),
    limit: z.number().int().min(1).max(20).default(NEWS_LIMIT).describe(
      "Maximum stories. Keep small for Observer context.",
    ),
  }),
  execute: async (input, options) => {
    return await getSectionNews({ category: input.category, limit: input.limit, signal: options.abortSignal });
  },
});
