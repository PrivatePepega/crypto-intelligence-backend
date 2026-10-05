import { runTool } from "./_harness.js";
import { cvNewsTool } from "../../cvNews.js";

/**
 * Qualifying run for `cvNews`.
 *
 * Fixed feed. The only input is an optional limit.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/cvNews.ts"
 *
 * Writes `../tool output/cvNews.response.json`.
 */
void runTool({ name: "cvNews", tool: cvNewsTool });
