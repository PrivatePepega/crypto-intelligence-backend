import { tool } from "ai";
import { z } from "zod";

import { getBitcoinNews } from "../../mcp/cryptocurrency.cv/fetchers/bitcoin.js";

/**
 * Articles requested when the caller does not specify.
 *
 * Higher than the other news tools by default, because this feed's yield is low:
 * most articles carry only the literal description `Comments` and are dropped,
 * so 5 requested commonly yields only 1 or 2 usable items.
 */
const DEFAULT_LIMIT = 20;

export const cvBitcoinNewsTool = tool({
  description:
    "Bitcoin-specific news from cryptocurrency.cv, each with a title and description, newest first.\n\n" +
    "Best for:\n" +
    "- Bitcoin-specific news\n" +
    "- bitcoin treasury and ETF coverage\n" +
    "\n" +
    "Limitations:\n" +
    "- free tier returns <=3 articles regardless of limit\n" +
    "- not suitable for non-Bitcoin crypto\n" +
    "- headline counts are small by nature",

  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(DEFAULT_LIMIT)
      .describe(
        "Maximum articles to request. Most are filtered for missing summaries, so a larger value returns more usable results.",
      ),
  }),

  execute: async (input, options) => {
    return await getBitcoinNews({
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});