import { runTool } from "./_harness.js";
import { cvDefiTool } from "../../cvDefi.js";

/**
 * Qualifying run for `cvDefi`.
 *
 * Fixed feed. Optional limit only.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/cvDefi.ts"
 *
 * Writes `../tool output/cvDefi.response.json`.
 */
void runTool({ name: "cvDefi", tool: cvDefiTool });
