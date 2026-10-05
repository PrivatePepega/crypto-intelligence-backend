import { runTool } from "./_harness.js";
import { webSearchTool } from "../../webSearchTool.js";

/**
 * Qualifying run for `webSearchTool` in the **technology** domain.
 *
 * Open web search. Whatever the query retrieves is the result.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/webSearchTool.technology.ts"
 *
 * Writes `../tool output/webSearchTool.technology.response.json`.
 */
void runTool({
  name: "webSearchTool.technology",
  tool: webSearchTool,
  args: {
    "query": "artificial intelligence technology news"
  },
});
