import { runTool } from "./_harness.js";
import { gdeltSearchEventsTool } from "../../gdeltSearchEvents.js";

/**
 * Qualifying run for `gdeltSearchEvents` in the **markets** domain.
 *
 * Topic enum has no 'markets' - finance is the nearest, so markets maps to finance.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/gdeltSearchEvents.markets.ts"
 *
 * Writes `../tool output/gdeltSearchEvents.markets.response.json`.
 */
void runTool({
  name: "gdeltSearchEvents.markets",
  tool: gdeltSearchEventsTool,
  args: {
    "topic": "finance",
    "days": 1
  },
});
