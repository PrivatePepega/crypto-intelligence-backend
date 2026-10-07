import { tool } from "ai";
import { z } from "zod";

import { searchExa } from "../providers/webSearch/exa/client.js";
import { normalizeExaResults } from "../providers/webSearch/exa/normalizer.js";
import { searchTavily } from "../providers/webSearch/tavily/client.js";
import { normalizeTavilyResults } from "../providers/webSearch/tavily/normalizer.js";
import { searchBrave } from "../providers/webSearch/brave/client.js";
import { normalizeBraveResults } from "../providers/webSearch/brave/normalizer.js";
import { searchYou } from "../providers/webSearch/you/client.js";
import { normalizeYouResults } from "../providers/webSearch/you/normalizer.js";

/**
 * Results requested per provider when the agent does not choose a count.
 *
 * Kept at 30 so omitting `limit` behaves exactly as before.
 */
export const DEFAULT_SEARCH_LIMIT = 30;

export const searchProviders = {
  exa: { search: searchExa, normalize: normalizeExaResults },
  tavily: { search: searchTavily, normalize: normalizeTavilyResults },
  brave: { search: searchBrave, normalize: normalizeBraveResults },
  you: { search: searchYou, normalize: normalizeYouResults },
};

export const webSearchTool = tool({
  description:
    "Search the public web for high-signal news and authoritative information. " +
    "Prioritize results from Reuters, Associated Press (AP), Bloomberg, and CoinDesk. " +
    "Prefer original reporting and primary sources over aggregators, reposts, SEO content, blogs, and low-quality crypto news sites. " +
    "Use this tool for broad discovery of important, breaking, emerging, or unexpected developments that may not appear in structured news feeds. " +
    "For general news, prioritize Reuters, AP, and Bloomberg; for crypto-specific news, prioritize Reuters, Bloomberg, AP, and CoinDesk. " +
    "When an official government, regulatory, company, or project source is the original source of an announcement, prefer that primary source when relevant. " +
    "Results are ranked web pages with titles and highlighted excerpts; excerpts are fragments, not full article summaries.",

  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Search for an important current development, event, or emerging story. " +
        "Use natural-language queries describing the topic, entity, market, or event you want to discover. " +
        "Favor queries that surface recent reporting from Reuters, AP, Bloomberg, or CoinDesk rather than generic web results. " +
        "For broad discovery, search for current developments rather than asking for explanations of a single known story.",
      ),

    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(DEFAULT_SEARCH_LIMIT)
      .describe(
        "Number of web results to request. Use enough results to discover high-signal reporting, but avoid excessive results when investigating a specific event.",
      ),
  }),

  execute: async ({ query, limit }) => webSearch(query, limit),
});

export const webSearch = async (query: string, limit: number = DEFAULT_SEARCH_LIMIT) => {
  const provider = searchProviders.exa;
  const response = await provider.search(query, limit);
  return provider.normalize(response);
};
