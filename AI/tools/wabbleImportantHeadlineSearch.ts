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
  "Fetches recent important headlines in general world news, mostly geopolitics - wars and ceasefires, sanctions, diplomacy, heads of state, central bank rate decisions, energy chokepoints, trade and tariffs. " +
  "Takes no arguments. Returns the whole current set in one call: 64 headlines measured on the last run, each with an importance rating of 'high' (5 items) or 'medium' (59), most significant first. " +
  "Best used as a fast breadth scan - what is happening in the world right now, ranked - before deciding where to dig deeper. " +
  "Know the limits before relying on it. Every item is a headline only, with no article body, no summary and no source attribution beyond a single publisher, Wabble, with the upstream source marked 'not_disclosed'. Treat it as an aggregator and do not cite it as the originating publisher. " +
  "It is also not deduplicated against one event: two of the five high-importance headlines in the last run covered the same Iran war development, so expect several items covering one story. " +
  "For attributed, sourced reporting use a news search tool; for a real quantitative figure use an indicator tool.",

  // Intentionally empty. See the note above.
  inputSchema: z.object({}),

  execute: async (_input, options) => {
    return await fetchMarketsHeadlines({
      signal: options.abortSignal,
    });
  },
});