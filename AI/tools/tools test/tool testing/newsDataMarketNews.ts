import { runTool } from "./_harness.js";
import { newsDataMarketNewsTool } from "../../newsDataMarketNews.js";

/**
 * Qualifying run for `newsDataMarketNews`.
 *
 * Market feed. q is optional and omitted.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/newsDataMarketNews.ts"
 *
 * Writes `../tool output/newsDataMarketNews.response.json`.
 */
void runTool({ name: "newsDataMarketNews", tool: newsDataMarketNewsTool });
