import { runTool } from "./_harness.js";
import { webSearchTool } from "../../webSearchTool.js";

/**
 * Qualifying run for `webSearchTool` in the **crypto** domain.
 *
 * Open web search. Whatever the query retrieves is the result.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/webSearchTool.crypto.ts"
 *
 * Writes `../tool output/webSearchTool.crypto.response.json`.
 */
void runTool({
  name: "webSearchTool.crypto",
  tool: webSearchTool,
  args: {
    "query": "Bitcoin crypto market news"
  },
});
