import { runTool } from "./_harness.js";
import { newsflashGetEventsTool } from "../../newsflashGetEvents.js";

/**
 * Qualifying run for `newsflashGetEvents` in the **markets** domain.
 *
 * Clustered event search. min_sources=2 so single-source noise does not dominate.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/newsflashGetEvents.markets.ts"
 *
 * Writes `../tool output/newsflashGetEvents.markets.response.json`.
 */
void runTool({
  name: "newsflashGetEvents.markets",
  tool: newsflashGetEventsTool,
  args: {
    "q": "stock market",
    "category": "business",
    "limit": 10,
    "min_sources": 2
  },
});
