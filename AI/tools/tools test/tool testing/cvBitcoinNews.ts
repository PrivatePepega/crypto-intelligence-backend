import { runTool } from "./_harness.js";
import { cvBitcoinNewsTool } from "../../cvBitcoinNews.js";

/**
 * Qualifying run for `cvBitcoinNews`.
 *
 * Fixed feed. Optional limit only.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/cvBitcoinNews.ts"
 *
 * Writes `../tool output/cvBitcoinNews.response.json`.
 */
void runTool({ name: "cvBitcoinNews", tool: cvBitcoinNewsTool });
