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
    "Targeted public-web search returning ranked pages with titles and highlighted excerpts.\n\n" +
    "Does: find primary sources, official announcements, filings, reports, and pages explaining a specific observation.\n" +
    "Does not: provide reliable publication dates, publisher metadata, article bodies, or guaranteed citation-ready evidence. Excerpts are fragments, not summaries.\n\n" +
    "Use late in the Observer loop for targeted verification/research, not as the first broad sweep. Be specific in the query.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Specific subject or event to investigate. Name the entity/event/document and the fact you need. Avoid broad category queries.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(DEFAULT_SEARCH_LIMIT)
      .describe(
        "How many results to request. Use a small number when confirming one specific fact, and a larger number only when surveying a topic you expect to be thinly covered.",
      ),
  }),
  execute: async ({ query, limit }) => webSearch(query, limit),
});

export const webSearch = async (query: string, limit: number = DEFAULT_SEARCH_LIMIT) => {
  const provider = searchProviders.exa;
  const response = await provider.search(query, limit);
  return provider.normalize(response);
};
