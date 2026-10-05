import { tool } from "ai";
import { z } from "zod";

import {
  assertNotError,
  callFmpTool,
  readPayloadRecords,
} from "../../mcp/fmp/client.js";

import { normalizeFmpArticleTitles } from "../../mcp/fmp/fmpArticlesNormalizer.js";

/**
 * Headlines per call.
 *
 * FMP caps `limit` at 200 and honours it exactly (verified: 3 -> 3, 20 -> 20,
 * 500 -> 200), so 40 is a real page size rather than an approximation. At
 * ~88 characters per headline this is roughly 3.5k characters, about 900 tokens.
 */
const ARTICLE_LIMIT = 40;

export const fmpGetArticlesListTool = tool({
  description:
    "40 financial headlines from FMP's own editorial team, newest first.\n\n" +
    "Best for:\n" +
    "- a quick read on what equities desks are publishing\n" +
    "\n" +
    "Limitations:\n" +
    "- headlines only - no body, date, ticker or link, so nothing is citable\n" +
    "- nearly all items are formulaic single-stock analyst pieces\n" +
    "- no FMP plan needed - the only feed available on free",

  // No inputs. Every parameter is fixed, which keeps the tool's schema - and
  // therefore the tokens spent describing it - at zero.
  inputSchema: z.object({}),

  execute: async (input, options) => {
    const result = await callFmpTool(
      "news",
      { endpoint: "fmp-articles", limit: ARTICLE_LIMIT },
      options.abortSignal,
    );

    // Throws rather than returning an empty list, so a failed call cannot be
    // misread as "no news".
    assertNotError(result);

    // `fmp-articles` returns a bare JSON array in the text block rather than
    // the documented `structuredContent.data`, so this reader matters.
    return normalizeFmpArticleTitles(readPayloadRecords(result));
  },
});