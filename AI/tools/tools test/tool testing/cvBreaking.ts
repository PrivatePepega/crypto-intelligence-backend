import { runTool } from "./_harness.js";
import { cvBreakingTool } from "../../cvBreaking.js";

/**
 * Qualifying run for `cvBreaking`.
 *
 * Fixed feed - a roughly two-hour breaking window. Optional limit only.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/cvBreaking.ts"
 *
 * Writes `../tool output/cvBreaking.response.json`.
 */
void runTool({ name: "cvBreaking", tool: cvBreakingTool });
