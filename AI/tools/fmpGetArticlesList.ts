import { tool } from "ai";
import { z } from "zod";
import { assertNotError, callFmpTool, readPayloadRecords } from "../../mcp/fmp/client.js";
import { normalizeFmpArticleTitles } from "../../mcp/fmp/fmpArticlesNormalizer.js";

/**
 * Articles requested when the agent does not choose a count.
 *
 * Kept at 20 so omitting `limit` behaves exactly as before.
 */
const ARTICLE_LIMIT = 20;

export const fmpGetArticlesListTool = tool({
  description:
    "FMP's latest financial headlines from its editorial feed.\n\n" +
    "Does: quick breadth across financial headlines.\n" +
    "Does not: provide article bodies, dates, tickers, links, or reliable importance ranking. The feed is heavily weighted toward formulaic single-stock analyst commentary.\n\n" +
    "Use only as secondary market breadth, not as evidence for an event.",
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(ARTICLE_LIMIT)
      .describe(
        "How many headlines to request. Titles only, so a larger number stays cheap, but most of this feed is low-value commentary.",
      ),
  }),
  execute: async (input, options) => {
    const result = await callFmpTool(
      "news",
      { endpoint: "fmp-articles", limit: input.limit },
      options.abortSignal,
    );
    assertNotError(result);
    return normalizeFmpArticleTitles(readPayloadRecords(result));
  },
});
