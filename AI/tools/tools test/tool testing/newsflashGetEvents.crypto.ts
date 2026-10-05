import { runTool } from "./_harness.js";
import { newsflashGetEventsTool } from "../../newsflashGetEvents.js";

/**
 * Qualifying run for `newsflashGetEvents` in the **crypto** domain.
 *
 * Clustered event search. min_sources=2 so single-source noise does not dominate.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/newsflashGetEvents.crypto.ts"
 *
 * Writes `../tool output/newsflashGetEvents.crypto.response.json`.
 */
void runTool({
  name: "newsflashGetEvents.crypto",
  tool: newsflashGetEventsTool,
  args: {
    "q": "Bitcoin",
    "category": "crypto",
    "limit": 10,
    "min_sources": 2
  },
});
