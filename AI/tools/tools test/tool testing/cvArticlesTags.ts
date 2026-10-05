import { runTool } from "./_harness.js";
import { cvArticlesTagsTool } from "../../cvArticlesTags.js";

/**
 * Qualifying run for `cvArticlesTags`.
 *
 * **Singular use, so one run rather than three domains.** Every slug in the
 * tool's `KNOWN_TAGS` list is a crypto topic - bitcoin, ethereum, etf, defi,
 * nft, stablecoin, regulation, altcoin, institutional, layer-2, hack,
 * ai-crypto, rwa. There is no markets tag and no technology tag, so running this
 * per domain is not possible; `bitcoin` is the highest-signal slug.
 *
 * Note the endpoint takes about ten seconds, the slowest in this folder.
 *
 * Run: npx tsx "AI/tools/tools test/tool testing/cvArticlesTags.ts"
 *
 * Writes `../tool output/cvArticlesTags.response.json`.
 */
void runTool({
  name: "cvArticlesTags",
  tool: cvArticlesTagsTool,
  args: { slug: "bitcoin" },
});