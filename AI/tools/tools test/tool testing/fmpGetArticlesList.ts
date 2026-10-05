import { runTool } from "./_harness.js";
import { fmpGetArticlesListTool } from "../../fmpGetArticlesList.js";

/**
 * Qualifying run for `fmpGetArticlesList`.
 *
 * Empty input schema - the limit and endpoint are fixed in the tool.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/fmpGetArticlesList.ts"
 *
 * Writes `../tool output/fmpGetArticlesList.response.json`.
 */
void runTool({ name: "fmpGetArticlesList", tool: fmpGetArticlesListTool });
