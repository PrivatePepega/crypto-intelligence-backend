import { tool } from "ai";
import { z } from "zod";
import { fetchMarketsHeadlines } from "../../mcp/wabble/wabbleNews.normalizer.js";

export const wabbleImportantHeadlineSearchTool = tool({
  description:
    "Important world-news headlines from Wabble, mostly geopolitics, with high/medium importance labels.\n\n" +
    "Does: fast ranked scanning for wars, sanctions, diplomacy, rate decisions, energy chokepoints, tariffs, and other major world developments.\n" +
    "Does not: provide summaries, source attribution, or deduplicated events. It is one aggregator, so use it as a signal rather than final evidence.\n\n" +
    "Takes no arguments and returns the provider's available important-headline set.",
  inputSchema: z.object({}),
  execute: async (_input, options) => fetchMarketsHeadlines({ signal: options.abortSignal }),
});
