import { tool } from "ai";
import { z } from "zod";

import { getDefiNews } from "../../mcp/cryptocurrency.cv/fetchers/defi.js";

const DEFAULT_LIMIT = 20;

export const cvDefiTool = tool({
  description:
    "Fetches recent DeFi and prediction-market news from cryptocurrency.cv.\n\n" +
    "Does: investigate DeFi protocols, DEXs, lending, stablecoins, governance, and prediction markets.\n" +
    "Does not: provide broad crypto coverage or reliably filter promotional material. The free tier returns at most 3 items and the feed can lean toward betting/prediction-market content.\n\n" +
    "Use for focused DeFi follow-up.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(30).default(DEFAULT_LIMIT).describe(
      "Maximum DeFi items.",
    ),
  }),
  execute: async (input, options) => {
    return await getDefiNews({ limit: input.limit, signal: options.abortSignal });
  },
});
