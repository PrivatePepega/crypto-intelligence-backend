import { runTool } from "./_harness.js";
import { newsMarketsNewsTool } from "../../newsMarketsNewsTool.js";

/**
 * Qualifying run for `newsMarketsNewsTool` in the **technology** domain.
 *
 * Section enum has no 'markets' - business is the nearest. Sections differ in size by an order of magnitude, which is the point of comparing them.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/newsMarketsNewsTool.technology.ts"
 *
 * Writes `../tool output/newsMarketsNewsTool.technology.response.json`.
 */
void runTool({
  name: "newsMarketsNewsTool.technology",
  tool: newsMarketsNewsTool,
  args: {
    "category": "tech"
  },
});
