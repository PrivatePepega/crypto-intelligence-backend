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
    "Headlines in general world news, mostly geopolitics, each rated 'high' (5) or 'medium' (59). Takes no arguments and returns all 64 at once.\n\n" +
    "Best for:\n" +
    "- a fast ranked scan of what is happening in the world\n" +
    "- wars, sanctions, diplomacy, rate decisions, energy chokepoints, tariffs\n" +
    "\n" +
    "Limitations:\n" +
    "- headline only - no body, summary or source attribution\n" +
    "- single publisher with upstream undisclosed, so cite it as an aggregator\n" +
    "- not deduplicated - one event can appear across several items",

  // Intentionally empty. See the note above.
  inputSchema: z.object({}),

  execute: async (_input, options) => {
    return await fetchMarketsHeadlines({
      signal: options.abortSignal,
    });
  },
});