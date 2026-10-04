import { tool } from "ai";
import { z } from "zod";

import { getNews } from "../../mcp/cryptocurrency.cv/fetchers/news.js";

/**
 * Articles requested when the caller does not specify.
 *
 * The limit lives here rather than in the normalizer so it can be tuned per
 * tool without editing provider code. The free tier caps the actual response at
 * 3 regardless, so a higher value only takes effect on a paid plan.
 */
const DEFAULT_LIMIT = 10;

export const cvNewsTool = tool({
  description:
    "Get the latest crypto news headlines and summaries from cryptocurrency.cv, each with a title and a description, newest first. Use this for broad crypto market coverage. Expect promotional and price-prediction content to be common. For urgent items use the breaking news tool; for Bitcoin-specific coverage use the Bitcoin news tool; for DeFi coverage use the DeFi tool.",

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
    return await getNews({
      limit: input.limit,
      signal: options.abortSignal,
    });
  },
});