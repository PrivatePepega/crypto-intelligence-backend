import { tool } from "ai";
import { z } from "zod";

import { getNews } from "../../mcp/cryptocurrency.cv/fetchers/news.js";

/**
 * Articles requested when the caller does not specify.
 *
 * The limit lives here rather than in the normalizer so it can be tuned per
 * tool without editing provider code. The free tier caps the actual response at
 * 3 regardless, so a higher value only takes effect on a paid plan.
 */
const DEFAULT_LIMIT = 20;

export const cvNewsTool = tool({
  description:
    "General crypto news from cryptocurrency.cv, each with a title and description, newest first.\n\n" +
    "Best for:\n" +
    "- a broad crypto sweep when nothing more specific applies\n" +
    "\n" +
    "Limitations:\n" +
    "- free tier returns <=3 articles regardless of limit\n" +
    "- low coverage - a measured call returned 2 items\n" +
    "- ticker noise possible and some titles are garbled\n" +
    "- prefer the breaking tool, which is better populated",

  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(DEFAULT_LIMIT)
      .describe(
        "Maximum articles to return. The free tier caps responses at 3 regardless.",
      ),
  }),

  execute: async (input, options) => {
    return await getNews({
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});