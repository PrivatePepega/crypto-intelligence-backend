import { tool } from "ai";
import { z } from "zod";

import { NEWSMARKETS_IN_SCOPE_SECTIONS } from "../../mcp/newsMarkets/client.js";
import { getSectionNews } from "../../mcp/newsMarkets/fetchers/index.js";

/**
 * How many stories this tool returns by default.
 *
 * This is the single place the page size is decided - change it here and both
 * the default and the ceiling move with it.
 *
 * It trims the **client-side** result, not an API request: the section endpoint
 * takes no parameters at all. So this is a slice of whatever the section
 * happened to carry, capped by the server at 40 stories.
 */
const NEWS_LIMIT = 10;

/** Ceiling accepted from the caller. Kept aligned with the constant above. */
const MAX_LIMIT = 40;

export const newsMarketsNewsTool = tool({
  description:
    "Get curated NewsMarkets headlines and short summaries for one category: 'crypto', 'ai', 'tech', or 'business'. " +
    "Each call returns a periodically refreshed snapshot with no paging or offset, so repeating the same category returns the same stories. " +
    "To broaden coverage, call different categories instead. The response includes 'total' (all stories available) and 'count' (stories returned); if they differ, the section exceeds the provider's 40-story cap. " +
    "'generatedAt' shows when the snapshot was built and may lag the current time; different categories may have different snapshot times. " +
    "Sections can be small, so a high limit does not guarantee many results.",

  inputSchema: z.object({
    category: z
      .enum(NEWSMARKETS_IN_SCOPE_SECTIONS)
      .describe(
        "Section to fetch: 'crypto' (digital assets), 'ai' (artificial intelligence), 'tech' (software and technology), or 'business' (markets, finance, companies). Call once per category to combine sections.",
      ),

    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .default(NEWS_LIMIT)
      .describe(
        `Maximum stories to return (default ${NEWS_LIMIT}). Applied after fetching, because the endpoint takes no parameters and returns whatever the section holds. Sections carry far fewer than this - crypto typically has only a few.`,
      ),
  }),

  execute: async (input, options) => {
    return await getSectionNews({
      category: input.category,
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});