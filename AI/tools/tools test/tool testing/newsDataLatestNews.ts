import { runTool } from "./_harness.js";
import { newsDataLatestNewsTool } from "../../newsDataLatestNews.js";

/**
 * Qualifying run for `newsDataLatestNews`.
 *
 * Unfiltered latest feed. q is optional and omitted.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/newsDataLatestNews.ts"
 *
 * Writes `../tool output/newsDataLatestNews.response.json`.
 */
void runTool({ name: "newsDataLatestNews", tool: newsDataLatestNewsTool });
