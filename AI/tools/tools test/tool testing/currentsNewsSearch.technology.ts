import { runTool } from "./_harness.js";
import { currentsSearchTool } from "../../currentsNewsSearch.js";

/**
 * Qualifying run for `currentsNewsSearch` in the **technology** domain.
 *
 * Keyword search. category is deliberately omitted - Currents has no crypto category, so including it for one domain only would make the three incomparable.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/currentsNewsSearch.technology.ts"
 *
 * Writes `../tool output/currentsNewsSearch.technology.response.json`.
 */
void runTool({
  name: "currentsNewsSearch.technology",
  tool: currentsSearchTool,
  args: {
    "keywords": "artificial intelligence chips",
    "page_size": 10
  },
});
