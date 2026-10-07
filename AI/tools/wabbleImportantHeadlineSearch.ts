import { tool } from "ai";
import { z } from "zod";
import { fetchMarketsHeadlines } from "../../mcp/wabble/wabbleNews.normalizer.js";

export const wabbleImportantHeadlineSearchTool = tool({
  description:
    "Important world-news headlines from Wabble, mostly geopolitics, with high/medium importance labels.\n\n" +
    "Does: fast ranked scanning for wars, sanctions, diplomacy, rate decisions, energy chokepoints, tariffs, and other major world developments.\n" +
    "Does not: provide summaries, source attribution, or deduplicated events. It is one aggregator, so use it as a signal rather than final evidence.\n\n" +
    "High-importance headlines are listed first, so a small limit still returns the most significant ones.",
  inputSchema: z.object({
    // Deliberately optional rather than defaulted: this tool previously returned
    // the provider's whole pool, and a default would have to guess that pool's
    // size to avoid silently truncating it.
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "Maximum headlines to return. Omit for the full important-headline set. This is a large feed, so prefer a smaller number unless you are deliberately surveying everything.",
      ),
  }),
  execute: async (input, options) => {
    const headlines = await fetchMarketsHeadlines({ signal: options.abortSignal });

    const items =
      input.limit === undefined ? headlines.items : headlines.items.slice(0, input.limit);

    return {
      count: items.length,
      items,
      // Provenance of the upstream slices, not of what was returned: when this
      // tool truncates, the per-slice counts no longer sum to `count`.
      slices: headlines.slices,
    };
  },
});
