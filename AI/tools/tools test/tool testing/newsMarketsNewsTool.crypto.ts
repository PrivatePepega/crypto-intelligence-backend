import { runTool } from "./_harness.js";
import { newsMarketsNewsTool } from "../../newsMarketsNewsTool.js";

/**
 * Qualifying run for `newsMarketsNewsTool` in the **crypto** domain.
 *
 * Section enum has no 'markets' - business is the nearest. Sections differ in size by an order of magnitude, which is the point of comparing them.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/newsMarketsNewsTool.crypto.ts"
 *
 * Writes `../tool output/newsMarketsNewsTool.crypto.response.json`.
 */
void runTool({
  name: "newsMarketsNewsTool.crypto",
  tool: newsMarketsNewsTool,
  args: {
    "category": "crypto"
  },
});
