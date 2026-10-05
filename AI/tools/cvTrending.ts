import { tool } from "ai";
import { z } from "zod";

import { getTrendingTopics } from "../../mcp/cryptocurrency.cv/fetchers/trending.js";

/** Trends requested when the caller does not specify. */
const DEFAULT_LIMIT = 20;

export const cvTrendingTool = tool({
  description:
    "Get trending crypto topics from cryptocurrency.cv, each with a topic name, an overall sentiment label and its recent headlines." +
    "Use this to see what the market is currently focused on, rather than to read individual articles - it is a good first call for orienting on the day's themes before drilling in." +
    "A measured run returned 6 topics, the top being 'AI' with sentiment 'bullish' and three supporting headlines." +
    "Two caveats: the same headline can appear under several topics, so topic counts are not distinct article counts, and the sentiment label reflects coverage volume rather than price direction, so do not read it as a market signal." +
    "The free tier caps responses at 3 topics regardless of the limit requested.",

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