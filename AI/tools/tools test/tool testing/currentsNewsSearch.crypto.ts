import { runTool } from "./_harness.js";
import { currentsSearchTool } from "../../currentsNewsSearch.js";

/**
 * Qualifying run for `currentsNewsSearch` in the **crypto** domain.
 *
 * Keyword search. category is deliberately omitted - Currents has no crypto category, so including it for one domain only would make the three incomparable.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/currentsNewsSearch.crypto.ts"
 *
 * Writes `../tool output/currentsNewsSearch.crypto.response.json`.
 */
void runTool({
  name: "currentsNewsSearch.crypto",
  tool: currentsSearchTool,
  args: {
    "keywords": "Bitcoin cryptocurrency",
    "page_size": 10
  },
});
