import { runTool } from "./_harness.js";
import { marketauxSearchTool } from "../../marketauxNewsSearch.js";

/**
 * Qualifying run for `marketauxNewsSearch` in the **markets** domain.
 *
 * Entity-aware search. Grouping on so duplicate coverage does not mask quality.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/marketauxNewsSearch.markets.ts"
 *
 * Writes `../tool output/marketauxNewsSearch.markets.response.json`.
 */
void runTool({
  name: "marketauxNewsSearch.markets",
  tool: marketauxSearchTool,
  args: {
    "search": "stock market|earnings|IPO",
    "limit": 10,
    "group_similar": true
  },
});
