import { runTool } from "./_harness.js";
import { newsflashSearchArticlesTool } from "../../newsflashSearchArticles.js";

/**
 * Qualifying run for `newsflashSearchArticles` in the **markets** domain.
 *
 * Flat article search, same terms as the event search for comparison.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/newsflashSearchArticles.markets.ts"
 *
 * Writes `../tool output/newsflashSearchArticles.markets.response.json`.
 */
void runTool({
  name: "newsflashSearchArticles.markets",
  tool: newsflashSearchArticlesTool,
  args: {
    "q": "stock market",
    "category": "business",
    "limit": 10
  },
});
