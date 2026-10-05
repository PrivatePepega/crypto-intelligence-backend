import { runTool } from "./_harness.js";
import { gdeltSearchStoriesTool } from "../../gdeltSearchStories.js";

/**
 * Qualifying run for `gdeltSearchStories` in the **technology** domain.
 *
 * Topic enum has no 'markets' - finance is the nearest.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/gdeltSearchStories.technology.ts"
 *
 * Writes `../tool output/gdeltSearchStories.technology.response.json`.
 */
void runTool({
  name: "gdeltSearchStories.technology",
  tool: gdeltSearchStoriesTool,
  args: {
    "topic": "technology",
    "days": 1
  },
});
