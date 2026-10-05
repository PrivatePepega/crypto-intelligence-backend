import { runTool } from "./_harness.js";
import { newsDataCryptoNewsTool } from "../../newsDataCryptoNews.js";

/**
 * Qualifying run for `newsDataCryptoNews`.
 *
 * General crypto feed. The coin filter is optional and omitted, so this qualifies the unfiltered output.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/newsDataCryptoNews.ts"
 *
 * Writes `../tool output/newsDataCryptoNews.response.json`.
 */
void runTool({ name: "newsDataCryptoNews", tool: newsDataCryptoNewsTool });
