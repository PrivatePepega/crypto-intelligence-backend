import { runTool } from "./_harness.js";
import { webSearchTool } from "../../webSearchTool.js";

/**
 * Qualifying run for `webSearchTool` in the **markets** domain.
 *
 * Open web search. Whatever the query retrieves is the result.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/webSearchTool.markets.ts"
 *
 * Writes `../tool output/webSearchTool.markets.response.json`.
 */
void runTool({
  name: "webSearchTool.markets",
  tool: webSearchTool,
  args: {
    "query": "stock market news"
  },
});
