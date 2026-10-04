import { tool } from "ai";
import { z } from "zod";

import { getTrendingTopics } from "../../mcp/cryptocurrency.cv/fetchers/trending.js";

/** Trends requested when the caller does not specify. */
const DEFAULT_LIMIT = 10;

export const cvTrendingTool = tool({
  description:
    "Get trending crypto topics from cryptocurrency.cv, each with a topic name, an overall sentiment and its recent headlines. Use this to see what the market is focused on right now rather than to read individual articles. Note the same headline can appear under several topics, and the sentiment reflects coverage volume rather than price direction.",

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