import { runTool } from "./_harness.js";
import { gdeltSearchEventsTool } from "../../gdeltSearchEvents.js";

/**
 * Qualifying run for `gdeltSearchEvents` in the **crypto** domain.
 *
 * Topic enum has no 'markets' - finance is the nearest, so markets maps to finance.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/gdeltSearchEvents.crypto.ts"
 *
 * Writes `../tool output/gdeltSearchEvents.crypto.response.json`.
 */
void runTool({
  name: "gdeltSearchEvents.crypto",
  tool: gdeltSearchEventsTool,
  args: {
    "topic": "crypto",
    "days": 1
  },
});
