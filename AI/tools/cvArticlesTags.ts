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
    "Articles carrying a specific cryptocurrency.cv tag, each with a title and description.\n\n" +
    "Best for:\n" +
    "- following one crypto theme across publishers\n" +
    "\n" +
    "Limitations:\n" +
    "- all tags are crypto-specific - none for markets or technology\n" +
    "- free tier returns <=3 articles regardless of limit\n" +
    "- slow: roughly 14 seconds per call\n" +
    "- thin - a 'bitcoin' request returned 2 articles",

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