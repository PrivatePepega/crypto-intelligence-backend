import { tool } from "ai";
import { z } from "zod";

import { getDefiNews } from "../../mcp/cryptocurrency.cv/fetchers/defi.js";

/** Articles requested when the caller does not specify. */
const DEFAULT_LIMIT = 20;

export const cvDefiTool = tool({
  description:
    "DeFi and prediction-market news from cryptocurrency.cv, each with a title and description, newest first.\n\n" +
    "Best for:\n" +
    "- DeFi protocol news - lending, DEXs, stablecoins, governance\n" +
    "- prediction-market developments\n" +
    "\n" +
    "Limitations:\n" +
    "- free tier returns <=3 articles regardless of limit\n" +
    "- leans toward prediction markets and betting promos\n" +
    "- descriptions are often promotional",

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
    return await getDefiNews({
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});