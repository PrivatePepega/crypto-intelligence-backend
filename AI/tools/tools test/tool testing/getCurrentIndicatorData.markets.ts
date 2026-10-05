import { runTool } from "./_harness.js";
import { getCurrentIndicatorTool } from "../../getCurrentIndicatorData.js";

/**
 * Qualifying run for `getCurrentIndicatorData` in the **markets** domain.
 *
 * Indicator set is chosen from a natural-language query, so the query alone decides the payload. Exported as a wrapper object - the tool is getCurrentIndicatorTool.get_current_indicator.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/getCurrentIndicatorData.markets.ts"
 *
 * Writes `../tool output/getCurrentIndicatorData.markets.response.json`.
 */
void runTool({
  name: "getCurrentIndicatorData.markets",
  tool: getCurrentIndicatorTool.get_current_indicator,
  args: {
    "query": "current stock market index levels"
  },
});
