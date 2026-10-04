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
const DEFAULT_LIMIT = 15;

export const cvBitcoinNewsTool = tool({
  description:
    "Get Bitcoin-specific news headlines and summaries from cryptocurrency.cv, each with a title and a description, newest first. Expect a low yield: most results from this feed carry no usable summary and are filtered out, so raising the limit is worthwhile when you need more.",

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