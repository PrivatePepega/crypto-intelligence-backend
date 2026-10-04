import { tool } from "ai";
import { z } from "zod";

import { fetchMarketsHeadlines } from "../../mcp/wabble/wabbleNews.normalizer.js";

/**
 * No inputs.
 *
 * The tool deliberately takes no parameters. There is nothing to filter on
 * within the account's access: `categories` is fixed to `markets` by the plan,
 * `importance` is fixed to high+medium because `low` is empty, and the keyword
 * filter `q` returned **zero** results at `importance=high` for all 11 queries
 * tried. A search box here would be a parameter that cannot usefully be set.
 *
 * Returns both importance slices in one call - high first, then medium - which
 * is the whole corpus available on this plan (5 + 59 = 64 articles).
 */
export const wabbleImportantHeadlineSearchTool = tool({
  description:
  "Fetches recent important world-news headlines from Wabble's markets feed, focused mainly on geopolitics. " +
  "Returns headlines with a 'high' or 'medium' importance rating, most significant first. " +
  "Typical topics include wars, diplomacy, sanctions, leaders, central banks, energy, trade and tariffs. " +
  "This is a broad headline scan: each item contains only a headline and no summary or article body, and no filtering or search is available. " +
  "Wabble is the aggregator and the original publisher is undisclosed, so cite Wabble rather than an upstream source.",

  // Intentionally empty. See the note above.
  inputSchema: z.object({}),

  execute: async (_input, options) => {
    return await fetchMarketsHeadlines({
      signal: options.abortSignal,
    });
  },
});