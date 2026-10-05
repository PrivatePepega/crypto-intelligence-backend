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
    "Get the latest financial news headlines written by Financial Modeling Prep's own editorial team. Returns 40 headlines, newest first, and requires no FMP plan - this is the only FMP feed available on a free plan. " +
  "This tool returns HEADLINES ONLY. No article text, no publication date, no ticker and no link, so nothing in the output can be cited or dated, and a headline cannot be followed up through this tool. " +
  "The measured batch was also low-signal for general research: nearly every item was a single-stock formulaic piece ('SPX Technologies (NYSE: SPXC) Stock Analysis: Analyst Ratings and Market Reaction', 'PBF Energy (NYSE: PBF): U.S. Oil Refiner Gains...') rather than market-moving news. " +
  "Use it for a quick read on what equities desks are publishing, not for identifying what matters. " +
  "For anything that needs a date, a source, a body or significance ranking, use an events tool, a news search, or a web search instead.",

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