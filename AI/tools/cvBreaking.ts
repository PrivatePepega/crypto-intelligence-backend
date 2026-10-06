import { tool } from "ai";
import { z } from "zod";

import { getBreakingNews } from "../../mcp/cryptocurrency.cv/fetchers/breaking.js";

const DEFAULT_LIMIT = 20;

export const cvBreakingTool = tool({
  description:
    "Fetches the freshest cryptocurrency.cv breaking-news feed, covering roughly the last two hours.\n\n" +
    "Does: detect very recent crypto developments, market-moving headlines, and breaking narratives.\n" +
    "Does not: cover non-crypto news or guarantee that every headline is important. Automated market tickers such as gas/fee updates can appear. The free tier returns at most 3 items.\n\n" +
    "High-priority first-pass tool for the Crypto Observer.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(30).default(DEFAULT_LIMIT).describe(
      "Maximum breaking items.",
    ),
  }),
  execute: async (input, options) => {
    return await getBreakingNews({
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});
