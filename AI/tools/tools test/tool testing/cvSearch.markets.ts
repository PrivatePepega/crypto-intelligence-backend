import { runTool } from "./_harness.js";
import { cvSearchTool } from "../../cvSearch.js";

/**
 * Qualifying run for `cvSearch` in the **markets** domain.
 *
 * Boolean search over headlines. One term per domain.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/cvSearch.markets.ts"
 *
 * Writes `../tool output/cvSearch.markets.response.json`.
 */
void runTool({
  name: "cvSearch.markets",
  tool: cvSearchTool,
  args: {
    "q": "stock market"
  },
});
