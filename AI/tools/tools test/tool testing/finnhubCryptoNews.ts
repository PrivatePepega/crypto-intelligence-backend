import { runTool } from "./_harness.js";
import { finnhubCryptoNewsTool } from "../../finnhubCryptoNews.js";

/**
 * Qualifying run for `finnhubCryptoNews`.
 *
 * Fixed feed pinned to category=crypto. Optional limit only.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/finnhubCryptoNews.ts"
 *
 * Writes `../tool output/finnhubCryptoNews.response.json`.
 */
void runTool({ name: "finnhubCryptoNews", tool: finnhubCryptoNewsTool });
