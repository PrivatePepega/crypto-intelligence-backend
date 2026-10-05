import { runTool } from "./_harness.js";
import { cvSearchTool } from "../../cvSearch.js";

/**
 * Qualifying run for `cvSearch` in the **crypto** domain.
 *
 * Boolean search over headlines. One term per domain.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/cvSearch.crypto.ts"
 *
 * Writes `../tool output/cvSearch.crypto.response.json`.
 */
void runTool({
  name: "cvSearch.crypto",
  tool: cvSearchTool,
  args: {
    "q": "Bitcoin"
  },
});
