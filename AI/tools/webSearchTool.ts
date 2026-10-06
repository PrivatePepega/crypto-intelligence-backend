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

export const searchProviders = {
  exa: { searchCounter: 10, search: searchExa, normalize: normalizeExaResults },
  tavily: { searchCounter: 10, search: searchTavily, normalize: normalizeTavilyResults },
  brave: { searchCounter: 10, search: searchBrave, normalize: normalizeBraveResults },
  you: { searchCounter: 10, search: searchYou, normalize: normalizeYouResults },
};

export const webSearchTool = tool({
  description:
    "Targeted public-web search returning ranked pages with titles and highlighted excerpts.\n\n" +
    "Does: find primary sources, official announcements, filings, reports, and pages explaining a specific observation.\n" +
    "Does not: provide reliable publication dates, publisher metadata, article bodies, or guaranteed citation-ready evidence. Excerpts are fragments, not summaries.\n\n" +
    "Use late in the Observer loop for targeted verification/research, not as the first broad sweep. Be specific in the query.",
  inputSchema: z.object({
    query: z.string().describe(
      "Specific subject or event to investigate. Name the entity/event/document and the fact you need. Avoid broad category queries.",
    ),
  }),
  execute: async ({ query }) => webSearch(query),
});

export const webSearch = async (query) => {
  const provider = searchProviders.exa;
  const response = await provider.search(query, provider.searchCounter);
  return provider.normalize(response);
};
