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
const NEWS_LIMIT = 20;

/** Ceiling accepted from the caller. Kept aligned with the constant above. */
const MAX_LIMIT = 40;

export const newsMarketsNewsTool = tool({
  description:
    "Get curated NewsMarkets headlines and short summaries for one category: 'crypto', 'ai', 'tech', or 'business'. Clean output - plain text, no HTML, no entity escaping - with a summary on every story measured so far. " +
    "Best for a tidy, section-scoped digest: 'ai' and 'tech' return well-written AI and technology coverage, 'business' returns markets and company news, 'crypto' is the smallest and thinnest. " +
    "IMPORTANT - this is a periodically republished SNAPSHOT, not a live feed, and it accepts no paging or offset. Repeating the same category returns the same stories, so vary the category to get breadth rather than repeating a call for volume. " +
    "Sections differ enormously in size and limit will not fix it: measured 2 stories for crypto, 30 for tech, and business capped at 40 against a reported total of 51. A high limit only produces a high count for business. " +
    "Because it is a snapshot, 'generatedAt' shows when the data was built and may lag the present - one section was measured 5.5 hours staler than its siblings. Check it before presenting anything as current. " +
    "If 'total' exceeds 'count', the section was truncated at the provider's 40-story cap and more exist. " +
    "For breaking news or anything needing sourcing, use a news or web search; for real figures, use an indicator tool.",

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