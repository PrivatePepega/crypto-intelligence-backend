import { tool } from "ai";
import { z } from "zod";

import { getTagArticles } from "../../mcp/cryptocurrency.cv/fetchers/tags.js";

const DEFAULT_LIMIT = 3;

export const cvArticlesTagsTool = tool({
  description:
    "Searches cryptocurrency.cv articles by one crypto-specific tag.\n\n" +
    "Does: follow a focused crypto theme such as Bitcoin, ETF, DeFi, regulation, hacks, institutional adoption, or RWA.\n" +
    "Does not: cover non-crypto topics or provide broad high-volume news. The free tier returns at most 3 articles and coverage can be thin.\n\n" +
    "Use for targeted crypto follow-up, not as the first general news sweep.",
  inputSchema: z.object({
    slug: z.string().describe(
      'Crypto tag slug, such as "bitcoin", "ethereum", "etf", "defi", "stablecoin", "regulation", "hack", "institutional", or "rwa".',
    ),
    limit: z.number().int().min(1).max(3).default(DEFAULT_LIMIT).describe(
      "Maximum articles. Free access is capped at 3.",
    ),
  }),
  execute: async (input, options) => {
    return await getTagArticles(input.slug, {
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});
