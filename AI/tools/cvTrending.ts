import { tool } from "ai";
import { z } from "zod";
import { getTrendingTopics } from "../../mcp/cryptocurrency.cv/fetchers/trending.js";

const DEFAULT_LIMIT = 20;

export const cvTrendingTool = tool({
  description:
    "Trending topics from cryptocurrency.cv with recent headlines and a coverage-based sentiment label.\n\n" +
    "Does: show what crypto coverage is concentrating on right now and help discover emerging topics.\n" +
    "Does not: measure price direction or guarantee that a trend is important. Headlines may repeat across topics. The free tier returns at most 3 topics.\n\n" +
    "Use early in the Crypto Observer when topic discovery matters.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(30).default(DEFAULT_LIMIT).describe(
      "Maximum trending topics. Free access is capped at 3.",
    ),
  }),
  execute: async (input, options) => {
    return await getTrendingTopics({ limit: input.limit, signal: options.abortSignal });
  },
});
