import { runTool } from "./_harness.js";
import { newsflashSearchArticlesTool } from "../../newsflashSearchArticles.js";

/**
 * Qualifying run for `newsflashSearchArticles` in the **crypto** domain.
 *
 * Flat article search, same terms as the event search for comparison.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/newsflashSearchArticles.crypto.ts"
 *
 * Writes `../tool output/newsflashSearchArticles.crypto.response.json`.
 */
void runTool({
  name: "newsflashSearchArticles.crypto",
  tool: newsflashSearchArticlesTool,
  args: {
    "q": "Bitcoin",
    "category": "crypto",
    "limit": 10
  },
});
