import { tool } from "ai";
import { z } from "zod";

import { getTrendingTopics } from "../../mcp/cryptocurrency.cv/fetchers/trending.js";

/** Trends requested when the caller does not specify. */
const DEFAULT_LIMIT = 20;

export const cvTrendingTool = tool({
  description:
    "Trending crypto topics from cryptocurrency.cv, each with a topic name, a sentiment label and its recent headlines.\n\n" +
    "Best for:\n" +
    "- crypto topic trends\n" +
    "- seeing what the market is focused on right now\n" +
    "- a quick orientation before drilling in\n" +
    "\n" +
    "Limitations:\n" +
    "- free tier returns <=3 topics regardless of limit\n" +
    "- the same headline can appear under several topics\n" +
    "- sentiment reflects coverage volume, not price direction",

  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(DEFAULT_LIMIT)
      .describe("Maximum trending topics to return."),
  }),

  execute: async (input, options) => {
    return await getTrendingTopics({
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});