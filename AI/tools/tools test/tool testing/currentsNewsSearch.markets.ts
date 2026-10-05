import { runTool } from "./_harness.js";
import { currentsSearchTool } from "../../currentsNewsSearch.js";

/**
 * Qualifying run for `currentsNewsSearch` in the **markets** domain.
 *
 * Keyword search. category is deliberately omitted - Currents has no crypto category, so including it for one domain only would make the three incomparable.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/currentsNewsSearch.markets.ts"
 *
 * Writes `../tool output/currentsNewsSearch.markets.response.json`.
 */
void runTool({
  name: "currentsNewsSearch.markets",
  tool: currentsSearchTool,
  args: {
    "keywords": "stock market earnings",
    "page_size": 10
  },
});
