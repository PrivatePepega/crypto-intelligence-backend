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

// --------------------------------------------------
// Search providers
// --------------------------------------------------

export const searchProviders = {
  exa: {
    searchCounter: 20,
    search: searchExa,
    normalize: normalizeExaResults,
  },

  tavily: {
    searchCounter: 20,
    search: searchTavily,
    normalize: normalizeTavilyResults,
  },

  brave: {
    searchCounter: 20,
    search: searchBrave,
    normalize: normalizeBraveResults,
  },

  you: {
    searchCounter: 20,
    search: searchYou,
    normalize: normalizeYouResults,
  },
};

// --------------------------------------------------
// Web search tool
// --------------------------------------------------

export const webSearchTool = tool({
  description:
    "Search the public web and return ranked results with a title and highlighted excerpt per hit, typically 15 results." +
    "This is the best tool for finding ACTUAL PUBLISHED PAGES with real source names attached - a measured markets query surfaced Reuters and CNBC directly - which makes it the right choice when you need something citable, when a specific company, filing, announcement or report is named, or when the other feeds have nothing." +
    "It also reaches beyond curated news to primary sources." +
    "Be aware of what it does not give you: results carry no publication date, publisher or URL in the output, so you cannot assess recency or cite precisely from the payload alone, and the highlights are extracted fragments rather than summaries." +
    "For understanding what happened use an events tool; for figures use an indicator tool.",

  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "A focused search query describing the information needed from the public web. Good examples: 'SEC tokenized stock approval filing', 'Birkenstock IPO valuation', 'OpenAI Super Intelligence Force'. Name the specific company, filing, report or event you want rather than a broad theme - this tool finds pages, so specificity is what makes the results useful.",
      ),
  }),

  execute: async ({ query }) => {
    return await webSearch(query);
  },
});

// --------------------------------------------------
// Web search
// --------------------------------------------------

export const webSearch = async (query: string) => {
  const provider = searchProviders.exa;

  const response = await provider.search(
    query,
    provider.searchCounter,
  );

  return provider.normalize(response);
};
