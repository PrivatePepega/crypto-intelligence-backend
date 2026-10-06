import { tool } from "ai";
import { z } from "zod";
import { assertNotError, callFmpTool, readPayloadRecords } from "../../mcp/fmp/client.js";
import { normalizeFmpArticleTitles } from "../../mcp/fmp/fmpArticlesNormalizer.js";

const ARTICLE_LIMIT = 20;

export const fmpGetArticlesListTool = tool({
  description:
    "FMP's latest financial headlines from its editorial feed.\n\n" +
    "Does: quick breadth across financial headlines.\n" +
    "Does not: provide article bodies, dates, tickers, links, or reliable importance ranking. The feed is heavily weighted toward formulaic single-stock analyst commentary.\n\n" +
    "Use only as secondary market breadth, not as evidence for an event.",
  inputSchema: z.object({}),
  execute: async (_input, options) => {
    const result = await callFmpTool(
      "news",
      { endpoint: "fmp-articles", limit: ARTICLE_LIMIT },
      options.abortSignal,
    );
    assertNotError(result);
    return normalizeFmpArticleTitles(readPayloadRecords(result));
  },
});
