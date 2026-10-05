import { tool } from "ai";
import { z } from "zod";

import { getTagArticles } from "../../mcp/cryptocurrency.cv/fetchers/tags.js";

/** Articles requested when the caller does not specify. */
const DEFAULT_LIMIT = 15;

/**
 * Tag slugs to suggest when the caller does not name one.
 *
 * `/api/tags` lists the full directory but has no normalizer, so these are the
 * known-good slugs rather than the complete set.
 */
const KNOWN_TAGS = [
  "bitcoin",
  "ethereum",
  "etf",
  "defi",
  "nft",
  "stablecoin",
  "regulation",
  "altcoin",
  "institutional",
  "layer-2",
  "hack",
  "ai-crypto",
  "rwa",
  "nft",
] as const;


export const cvArticlesTagsTool = tool({
  description:
    "Get crypto news articles carrying a specific tag from cryptocurrency.cv, each with a title and a description. " +
    "Use this to follow one theme across publishers - a coin, a sector, a regulatory topic. Every available tag is crypto-specific, so this tool has no use outside crypto. " +
    "Weigh the cost: this is the slowest tool here at roughly 14 seconds per call, because the tag endpoint is slow upstream. " +
    "Results are also thin - a 'bitcoin' tag request returned only 2 articles, and the free tier caps responses at 3 regardless of the limit you ask for, so a larger limit costs nothing and gains nothing. " +
    "For broad crypto coverage use the news or breaking tool instead; for a single coin's market data use an indicator or price tool.",

  inputSchema: z.object({
    slug: z
      .string()
      .describe(
        `Tag slug, such as "bitcoin" or "ethereum". All available tags are crypto-specific. Common values: ${KNOWN_TAGS.join(", ")}. Note results are thin - a 'bitcoin' request returned 2 articles - and the free tier caps responses at 3.`,
      ),

    limit: z
      .number()
      .int()
      .min(15)
      .max(100)
      .default(DEFAULT_LIMIT)
      .describe(
        "Maximum articles to request. The free tier caps responses at 3 regardless.",
      ),
  }),

  execute: async (input, options) => {
    return await getTagArticles(input.slug, {
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});