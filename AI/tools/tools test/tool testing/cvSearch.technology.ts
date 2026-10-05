import { runTool } from "./_harness.js";
import { cvSearchTool } from "../../cvSearch.js";

/**
 * Qualifying run for `cvSearch` in the **technology** domain.
 *
 * Boolean search over headlines. One term per domain.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/cvSearch.technology.ts"
 *
 * Writes `../tool output/cvSearch.technology.response.json`.
 */
void runTool({
  name: "cvSearch.technology",
  tool: cvSearchTool,
  args: {
    "q": "artificial intelligence"
  },
});
