import { runTool } from "./_harness.js";
import { gdeltSearchStoriesTool } from "../../gdeltSearchStories.js";

/**
 * Qualifying run for `gdeltSearchStories` in the **markets** domain.
 *
 * Topic enum has no 'markets' - finance is the nearest.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/gdeltSearchStories.markets.ts"
 *
 * Writes `../tool output/gdeltSearchStories.markets.response.json`.
 */
void runTool({
  name: "gdeltSearchStories.markets",
  tool: gdeltSearchStoriesTool,
  args: {
    "topic": "finance",
    "days": 1
  },
});
