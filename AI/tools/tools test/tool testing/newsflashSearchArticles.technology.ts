import { runTool } from "./_harness.js";
import { newsflashSearchArticlesTool } from "../../newsflashSearchArticles.js";

/**
 * Qualifying run for `newsflashSearchArticles` in the **technology** domain.
 *
 * Flat article search, same terms as the event search for comparison.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/newsflashSearchArticles.technology.ts"
 *
 * Writes `../tool output/newsflashSearchArticles.technology.response.json`.
 */
void runTool({
  name: "newsflashSearchArticles.technology",
  tool: newsflashSearchArticlesTool,
  args: {
    "q": "artificial intelligence",
    "category": "tech",
    "limit": 10
  },
});
