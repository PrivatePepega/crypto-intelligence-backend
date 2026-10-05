import { runTool } from "./_harness.js";
import { newsflashGetEventsTool } from "../../newsflashGetEvents.js";

/**
 * Qualifying run for `newsflashGetEvents` in the **technology** domain.
 *
 * Clustered event search. min_sources=2 so single-source noise does not dominate.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/newsflashGetEvents.technology.ts"
 *
 * Writes `../tool output/newsflashGetEvents.technology.response.json`.
 */
void runTool({
  name: "newsflashGetEvents.technology",
  tool: newsflashGetEventsTool,
  args: {
    "q": "artificial intelligence",
    "category": "tech",
    "limit": 10,
    "min_sources": 2
  },
});
