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
    "Curated headlines and summaries from NewsMarkets for one section, served from a periodically republished snapshot.\n\n" +
    "Best for:\n" +
    "- tidy section digests - ai, tech, business, crypto\n" +
    "- clean summaries with no HTML or entity escaping\n" +
    "\n" +
    "Limitations:\n" +
    "- a snapshot, not a live feed - check generatedAt before calling it current\n" +
    "- no paging, so repeating a category returns the same stories\n" +
    "- sections vary hugely - crypto returned 2 stories, business 40 against a total of 51\n" +
    "- for breaking or sourced news use a news or web search",

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