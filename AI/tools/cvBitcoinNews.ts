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
    "Get Bitcoin-specific news from cryptocurrency.cv, each with a title and a description, newest first." +
    "Use this when the subject is Bitcoin rather than crypto generally - the measured run returned focused items on ether treasury accumulation and weekly-close price structure." +
    "Expect a low yield: the free tier caps responses at 3 articles regardless of the limit requested, so a measured call returned exactly 3." +
    "A larger limit costs nothing and gains nothing here." +
    "For non-Bitcoin crypto use the news or breaking tool; for a Bitcoin price or market-cap figure use an indicator or price tool rather than inferring one from a headline.",

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