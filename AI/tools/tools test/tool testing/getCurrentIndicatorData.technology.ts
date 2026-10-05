import { runTool } from "./_harness.js";
import { getCurrentIndicatorTool } from "../../getCurrentIndicatorData.js";

/**
 * Qualifying run for `getCurrentIndicatorData` in the **technology** domain.
 *
 * Indicator set is chosen from a natural-language query, so the query alone decides the payload. Exported as a wrapper object - the tool is getCurrentIndicatorTool.get_current_indicator.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/getCurrentIndicatorData.technology.ts"
 *
 * Writes `../tool output/getCurrentIndicatorData.technology.response.json`.
 */
void runTool({
  name: "getCurrentIndicatorData.technology",
  tool: getCurrentIndicatorTool.get_current_indicator,
  args: {
    "query": "current AI semiconductor market data"
  },
});
