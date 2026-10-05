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
    "Get crypto news articles carrying a specific tag from cryptocurrency.cv, each with a title and a description. Use this to follow a theme across publishers, such as a coin, sector or regulatory topic. Slow: a request typically takes around ten seconds. For broad coverage use the news tool instead.",

  inputSchema: z.object({
    slug: z
      .string()
      .describe(
        `Tag slug, such as "bitcoin" or "ethereum". Common values: ${KNOWN_TAGS.join(", ")}.`,
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