import { runTool } from "./_harness.js";
import { marketauxSearchTool } from "../../marketauxNewsSearch.js";

/**
 * Qualifying run for `marketauxNewsSearch` in the **technology** domain.
 *
 * Entity-aware search. Grouping on so duplicate coverage does not mask quality.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/marketauxNewsSearch.technology.ts"
 *
 * Writes `../tool output/marketauxNewsSearch.technology.response.json`.
 */
void runTool({
  name: "marketauxNewsSearch.technology",
  tool: marketauxSearchTool,
  args: {
    "search": "artificial intelligence|software|chips",
    "limit": 10,
    "group_similar": true
  },
});
