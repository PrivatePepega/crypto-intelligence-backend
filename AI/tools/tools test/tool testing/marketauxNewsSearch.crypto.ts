import { runTool } from "./_harness.js";
import { marketauxSearchTool } from "../../marketauxNewsSearch.js";

/**
 * Qualifying run for `marketauxNewsSearch` in the **crypto** domain.
 *
 * Entity-aware search. Grouping on so duplicate coverage does not mask quality.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/marketauxNewsSearch.crypto.ts"
 *
 * Writes `../tool output/marketauxNewsSearch.crypto.response.json`.
 */
void runTool({
  name: "marketauxNewsSearch.crypto",
  tool: marketauxSearchTool,
  args: {
    "search": "Bitcoin|Ethereum|DeFi",
    "limit": 10,
    "group_similar": true
  },
});
