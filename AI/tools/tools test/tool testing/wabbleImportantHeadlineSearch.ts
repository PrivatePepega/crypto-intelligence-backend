import { runTool } from "./_harness.js";
import { wabbleImportantHeadlineSearchTool } from "../../wabbleImportantHeadlineSearch.js";

/**
 * Qualifying run for `wabbleImportantHeadlineSearch`.
 *
 * Empty input schema - returns both importance slices in one call.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/wabbleImportantHeadlineSearch.ts"
 *
 * Writes `../tool output/wabbleImportantHeadlineSearch.response.json`.
 */
void runTool({ name: "wabbleImportantHeadlineSearch", tool: wabbleImportantHeadlineSearchTool });
