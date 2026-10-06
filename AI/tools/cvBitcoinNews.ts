import { tool } from "ai";
import { z } from "zod";

import { getBitcoinNews } from "../../mcp/cryptocurrency.cv/fetchers/bitcoin.js";

const DEFAULT_LIMIT = 20;

export const cvBitcoinNewsTool = tool({
  description:
    "Fetches recent Bitcoin-specific news from cryptocurrency.cv.\n\n" +
    "Does: Bitcoin-specific headlines, including treasury, ETF, market, and ecosystem coverage.\n" +
    "Does not: cover the broader crypto ecosystem well or guarantee meaningful event-level news. The free tier returns at most 3 articles.\n\n" +
    "Use when the Observer has a Bitcoin-specific observation to investigate.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(30).default(DEFAULT_LIMIT).describe(
      "Maximum Bitcoin articles. Free access is capped at 3.",
    ),
  }),
  execute: async (input, options) => {
    return await getBitcoinNews({
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});
