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
    "Search the public web for recent information relevant to the Observer's domain. Use this to discover current events, announcements, regulatory developments, security incidents, market narratives, and other developments that may not be available through deterministic database indicators.",

  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "A focused search query describing the information needed from the public web.",
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
