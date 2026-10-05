import { runTool } from "./_harness.js";
import { cvTrendingTool } from "../../cvTrending.js";

/**
 * Qualifying run for `cvTrending`.
 *
 * Fixed feed of trending topics. Optional limit only.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/cvTrending.ts"
 *
 * Writes `../tool output/cvTrending.response.json`.
 */
void runTool({ name: "cvTrending", tool: cvTrendingTool });
