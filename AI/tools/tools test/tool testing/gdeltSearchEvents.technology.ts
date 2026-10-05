import { runTool } from "./_harness.js";
import { gdeltSearchEventsTool } from "../../gdeltSearchEvents.js";

/**
 * Qualifying run for `gdeltSearchEvents` in the **technology** domain.
 *
 * Topic enum has no 'markets' - finance is the nearest, so markets maps to finance.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/gdeltSearchEvents.technology.ts"
 *
 * Writes `../tool output/gdeltSearchEvents.technology.response.json`.
 */
void runTool({
  name: "gdeltSearchEvents.technology",
  tool: gdeltSearchEventsTool,
  args: {
    "topic": "technology",
    "days": 1
  },
});
