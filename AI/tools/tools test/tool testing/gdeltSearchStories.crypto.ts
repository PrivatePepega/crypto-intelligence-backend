import { runTool } from "./_harness.js";
import { gdeltSearchStoriesTool } from "../../gdeltSearchStories.js";

/**
 * Qualifying run for `gdeltSearchStories` in the **crypto** domain.
 *
 * Topic enum has no 'markets' - finance is the nearest.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/gdeltSearchStories.crypto.ts"
 *
 * Writes `../tool output/gdeltSearchStories.crypto.response.json`.
 */
void runTool({
  name: "gdeltSearchStories.crypto",
  tool: gdeltSearchStoriesTool,
  args: {
    "topic": "crypto",
    "days": 1
  },
});
